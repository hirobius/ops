/**
 * HDS ESLint flat config — 12i-quality-eslint-upgrade
 *
 * Stack:
 *   @typescript-eslint/recommended
 *   + react/recommended
 *   + react-hooks/recommended
 *   + jsx-a11y/recommended
 *   + import-x/recommended (with TypeScript resolver, ESLint 10 native)
 *
 * The no-restricted-syntax guardrail for raw div grid layouts is preserved.
 *
 * TODO (promote when warning count reaches 0):
 *   Change `pnpm lint` script from:
 *     `eslint src`
 *   to:
 *     `eslint src --max-warnings=0`
 *   to make the lint gate hard-blocking in pre-commit.
 *
 * NOTE: @typescript-eslint/recommended-type-checked is intentionally NOT used
 * here — it requires a tsconfig project path (the typecheck tsconfig only covers
 * a subset of src files, not all of src) and significantly slows runs.
 * It is scheduled for a separate burndown unit once the baseline warning count
 * reaches zero.
 *
 * NOTE: eslint-plugin-import@2.x called sourceCode.getTokenOrCommentBefore
 * which was removed in ESLint 9/10. Migrated to eslint-plugin-import-x (maintained
 * fork with full ESLint 10 support). import-x/order is now re-enabled.
 *
 * Deprecated typography tokens covered by the no-restricted-syntax family:
 * label, title, displayXl, body2, monoXs, labelTechnical.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import tailwindPlugin from 'eslint-plugin-tailwindcss';
import globals from 'globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  // --- Global ignores --------------------------------------------------
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '**/*.generated.*',
      'public/**',
      'figma-agent-plugin/**',
      '.claude/**',
      'scripts/_retired-*/**',
    ],
  },

  // --- TypeScript + React source files (src only) ----------------------
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
        // No `project` here — avoids tsconfig.typecheck.json partial-file coverage
        // issues. Use recommended (not recommended-type-checked) for now.
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    settings: {
      react: { version: '18.3.1' },
      'import-x/resolver': {
        typescript: {},
        node: { extensions: ['.js', '.jsx', '.ts', '.tsx'] },
      },
      tailwindcss: {
        // Tailwind v4 uses CSS-based config. Point plugin at the CSS entry that
        // imports tailwindcss and sets @config. The plugin's worker uses this
        // to resolve valid class names.
        config: pathResolve(__dirname, 'src/styles/theme.css'),
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      'import-x': importPlugin,
      tailwindcss: tailwindPlugin,
    },
    rules: {
      // --- @typescript-eslint/recommended rules ------------------------
      ...tsPlugin.configs.recommended.rules,
      // Allow _-prefixed names to be intentionally unused (mirrors TS noUnusedLocals convention)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // --- react/recommended rules -------------------------------------
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/prop-types': 'off', // TypeScript handles prop validation

      // --- react-hooks/recommended rules -------------------------------
      ...reactHooksPlugin.configs.recommended.rules,

      // --- jsx-a11y/recommended rules ----------------------------------
      ...jsxA11yPlugin.configs.recommended.rules,

      // --- tailwindcss rules -------------------------------------------
      // Replaces check-tailwind-arbitrary.mjs (116 LOC) + check-tailwind-colors.mjs (120 LOC).
      // no-arbitrary-value: catches bg-[#hex], text-[14px], p-[1.25rem] in class strings.
      //   CSS var bracket syntax (bg-[var(--...)]) is exempt — those are semantic tokens.
      //   Exemption: eslint-disable-next-line tailwindcss/no-arbitrary-value (replaces // tw-ok:)
      // no-custom-classname: catches text-zinc-400, bg-gray-100 Tailwind default palette classes.
      //   HDS custom classes (hds-*, skip-link) are whitelisted via cssFiles pointing at the
      //   project CSS where they're defined.
      'tailwindcss/no-arbitrary-value': 'warn',
      'tailwindcss/no-custom-classname': [
        'warn',
        {
          // Allow HDS custom utility classes and any class defined in the project CSS
          cssFiles: ['src/styles/**/*.css'],
          whitelist: ['hds\\-.+', 'skip-link', 'hds-bypass'],
        },
      ],

      // --- import-x/recommended rules ----------------------------------
      ...importPlugin.configs['flat/recommended'].rules,
      // Ignore Vite virtual modules that ESLint cannot resolve
      'import-x/no-unresolved': ['error', { ignore: ['^virtual:'] }],
      // import-x/order: re-enabled (eslint-plugin-import-x has full ESLint 10 support)
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling'],
        },
      ],

      // --- HDS custom guardrails ---------------------------------------
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "JSXOpeningElement[name.name='div'] JSXAttribute[name.name='style'] ObjectExpression > Property[key.name='display'][value.value='grid']",
          message:
            'Avoid raw div grid layouts. Use HdsGrid or a token-governed layout primitive instead.',
        },
      ],
    },
  },

  // --- React Three Fiber (R3F) scene files — whitelist 3D JSX props -----
  //
  // R3F extends React's JSX namespace with Three.js object props (position,
  // rotation, intensity, geometry, etc.). react/no-unknown-property fires on
  // all of them. The ignore list below covers every prop surfaced by the
  // current codebase audit (2026-05-01); add new ones here rather than
  // adding per-file disables.
  {
    files: [
      'src/app/pages/sketches/**/*.{js,jsx,ts,tsx}',
      'src/app/components/mobius-*.{ts,tsx}',
      'src/app/components/card-viz*.{ts,tsx}',
    ],
    rules: {
      'react/no-unknown-property': [
        'error',
        {
          ignore: [
            // Three.js object transform props
            'position',
            'rotation',
            'scale',
            // Light props
            'intensity',
            'distance',
            'renderOrder',
            // Geometry / mesh props
            'geometry',
            'args',
            'attach',
            // Material props
            'wireframe',
            'flatShading',
            'transparent',
            'depthTest',
            'depthWrite',
            'roughness',
            'metalness',
            'emissive',
            'emissiveIntensity',
            'transmission',
            'ior',
            'thickness',
            'side',
            'envMapIntensity',
            'dithering',
            'clearcoat',
            'clearcoatRoughness',
            'reflectivity',
            // Shader / custom material props
            'vertexShader',
            'fragmentShader',
            'uniforms',
            'onBeforeCompile',
            'customProgramCacheKey',
            // Buffer geometry props
            'array',
            'count',
            'itemSize',
          ],
        },
      ],
    },
  },

  // --- Scripts + Validators (Node environment, no JSX, no type-aware) --
  {
    files: ['scripts/**/*.{js,mjs,ts}', 'validators/**/*.{js,mjs,ts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'import-x': importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...importPlugin.configs['flat/recommended'].rules,
      // Scripts routinely use dynamic patterns; relax these for Node tooling
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      // playwright types don't expose named exports statically; suppress false positives
      'import-x/named': 'off',
      // Mirror src convention — _-prefixed params are intentionally unused
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  // --- Tests (relaxed subset) ------------------------------------------
  {
    files: ['tests/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Tests are allowed to be laxer with types
      '@typescript-eslint/no-explicit-any': 'off',
      // react/jsx-key is intentionally relaxed in tests
      'react/jsx-key': 'off',
      // react-hooks rules still apply in tests
      ...reactHooksPlugin.configs.recommended.rules,
      // Type-test files use `void expr, expr;` to suppress unused-var warnings.
      // The TS variant of no-unused-expressions does not allow void; turn it off for tests.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  // --- Prettier compatibility (last — disables format-conflicting rules)
  prettierConfig,
];
