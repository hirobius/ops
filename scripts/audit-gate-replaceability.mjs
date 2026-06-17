#!/usr/bin/env node
/**
 * audit-gate-replaceability.mjs
 *
 * Reads docs/guardrails/registry.json, walks every registered gate,
 * and produces a per-gate replaceability verdict with the most likely
 * industry-tool replacement.
 *
 * Output: /tmp/gate-replaceability-audit.json
 * Summary table when --summary flag is used.
 *
 * Verdicts:
 *   "fully-replaceable"    — drop custom script, swap in industry tool, equal/better coverage
 *   "partially-replaceable"— industry tool covers ~70%, residual HDS-specific logic remains
 *   "genuinely-custom"     — no industry equivalent (orchestration, token-system, meta-validators)
 *
 * Usage:
 *   node scripts/audit-gate-replaceability.mjs
 *   node scripts/audit-gate-replaceability.mjs --summary
 *
 * @module audit-gate-replaceability
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REGISTRY_PATH = join(ROOT, 'docs', 'guardrails', 'registry.json');
const OUTPUT_PATH = '/tmp/gate-replaceability-audit.json';

const SUMMARY_MODE = process.argv.includes('--summary');

// ── Helpers ──────────────────────────────────────────────────────────────────

function getScriptLOC(scriptRelPath) {
  const abs = join(ROOT, scriptRelPath);
  if (!existsSync(abs)) return 0;
  try {
    const src = readFileSync(abs, 'utf8');
    return src.split('\n').length;
  } catch {
    return 0;
  }
}

// ── Lookup table ─────────────────────────────────────────────────────────────
// Maps gate id → structured replacement info.
// For gates NOT in this table, defaults to "genuinely-custom".

const REPLACEMENT_TABLE = {
  // ── A11y gates ──────────────────────────────────────────────────────────────

  'check-aria-labels': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'eslint-plugin-jsx-a11y',
      source: 'https://github.com/jsx-eslint/eslint-plugin-jsx-a11y',
      npmPackage: 'eslint-plugin-jsx-a11y',
      configEffort: 'trivial',
      exampleConfig:
        '// .eslintrc.cjs\n{ plugins: ["jsx-a11y"], extends: ["plugin:jsx-a11y/recommended"] }',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'jsx-a11y/alt-text + jsx-a11y/aria-props cover img alt, svg aria-hidden, and role=img rules. Recommended preset catches more ARIA violations than the custom script.',
  },

  'check-focus-states': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'eslint-plugin-jsx-a11y + axe-core',
      source: 'https://github.com/dequelabs/axe-core',
      npmPackage: 'eslint-plugin-jsx-a11y @axe-core/react',
      configEffort: 'small',
      exampleConfig:
        '// vitest + @axe-core/react\nimport { axe } from "vitest-axe";\nexpect(await axe(html)).toHaveNoViolations();',
    },
    keepReason:
      'Token-focus-ring rule (must use var(--hds-focus-ring)) is HDS-specific; axe-core only asserts focus is visible, not which token is used.',
    migrationCost: 'small',
    coverageGain: 'higher',
    notes:
      'axe-core/interactive-focus covers ~70% of cases at runtime. The residual rule (HDS token enforcement) should be folded into check-token-paths-ratchet rather than kept as a separate gate.',
  },

  'check-semantic-html': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'eslint-plugin-jsx-a11y',
      source: 'https://github.com/jsx-eslint/eslint-plugin-jsx-a11y',
      npmPackage: 'eslint-plugin-jsx-a11y',
      configEffort: 'trivial',
      exampleConfig:
        '// rules: jsx-a11y/heading-has-content, jsx-a11y/anchor-is-valid, jsx-a11y/no-redundant-roles',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'jsx-a11y heading/anchor/landmark rules cover all checks in the custom script and add many more. Eliminate the custom walker entirely.',
  },

  'check-reduced-motion': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'eslint-plugin-jsx-a11y',
      source: 'https://github.com/jsx-eslint/eslint-plugin-jsx-a11y',
      npmPackage: 'eslint-plugin-jsx-a11y',
      configEffort: 'small',
      exampleConfig:
        '// stylelint-a11y plugin for @media (prefers-reduced-motion) enforcement in CSS',
    },
    keepReason:
      'Framer Motion useReducedMotion() enforcement is HDS-specific. stylelint + jsx-a11y cover CSS/HTML layer but not the TS/TSX motion hook pattern.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'stylelint-a11y covers the CSS @media prefers-reduced-motion layer. The Framer Motion hook check should stay as a small custom rule or fold into check-motion.',
  },

  'check-image-loading': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'eslint-plugin-jsx-a11y',
      source: 'https://github.com/jsx-eslint/eslint-plugin-jsx-a11y',
      npmPackage: 'eslint-plugin-jsx-a11y',
      configEffort: 'trivial',
      exampleConfig:
        '// Custom eslint rule or jsx-a11y; alternatively @next/eslint-plugin-next img rule',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'A simple eslint rule (or jsx-a11y/img-loading) catches missing loading= attribute. The custom scanner is ~118 LOC for what is a 2-line regex check.',
  },

  'check-contrast': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'axe-core / Storybook a11y addon',
      source: 'https://github.com/dequelabs/axe-core',
      npmPackage: '@axe-core/react',
      configEffort: 'small',
      exampleConfig: '// vitest-axe in component tests; or Storybook a11y addon for visual checks',
    },
    keepReason:
      'The custom gate reads hirobius.tokens.json directly and validates the token-level contrast pairs in design-time, before any component is rendered. axe-core only evaluates rendered DOM. The token-level design-time check has no industry equivalent.',
    migrationCost: 'medium',
    coverageGain: 'higher',
    notes:
      'axe-core catches runtime contrast violations better (real rendered DOM). The design-time token audit is genuinely custom. Recommended: keep 1 design-time token-pair check, add axe-core for runtime coverage.',
  },

  // ── Tailwind gates ──────────────────────────────────────────────────────────

  'check-tailwind-arbitrary': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'eslint-plugin-tailwindcss',
      source: 'https://github.com/francoismassart/eslint-plugin-tailwindcss',
      npmPackage: 'eslint-plugin-tailwindcss',
      configEffort: 'trivial',
      exampleConfig: '// .eslintrc: "tailwindcss/no-arbitrary-value": "error"',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'eslint-plugin-tailwindcss/no-arbitrary-value does exactly this. The custom script is ~115 LOC duplicating what one eslint rule covers. Eliminates the custom scanner entirely.',
  },

  'check-tailwind-colors': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'eslint-plugin-tailwindcss',
      source: 'https://github.com/francoismassart/eslint-plugin-tailwindcss',
      npmPackage: 'eslint-plugin-tailwindcss',
      configEffort: 'trivial',
      exampleConfig:
        '// eslint-plugin-tailwindcss classnames-order + no-custom-classname catches default palette usage',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'The custom script catches Tailwind default palette classes (bg-blue-500 etc.). eslint-plugin-tailwindcss with a restricted class allowlist covers this. Alternative: a single eslint rule banning tw-default-palette classes.',
  },

  // ── Style / CSS gates ───────────────────────────────────────────────────────

  'check-style-discipline': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint + eslint-plugin-react',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint stylelint-declaration-property-value-allowed-list',
      configEffort: 'small',
      exampleConfig:
        '// stylelint.config.cjs\n{ rules: { "declaration-property-value-allowed-list": { color: ["/^var\\(--/"] } } }',
    },
    keepReason:
      'The inline-style count rule (6+ inline props = error) and the suspicious style-prop value (function/string reference) checks are HDS-specific behavioral contracts with no stylelint equivalent.',
    migrationCost: 'small',
    coverageGain: 'higher',
    notes:
      'stylelint with declaration-property-value-allowed-list covers raw color literals in CSS. eslint react/forbid-component-props can flag inline style. The 6-prop threshold is custom; consider dropping it in favor of blanket prohibition.',
  },

  'check-hardcoded-colors': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint stylelint-declaration-property-value-allowed-list',
      configEffort: 'small',
      exampleConfig: '// Enforce all color: declarations must match var(--...) pattern',
    },
    keepReason:
      'JSX color prop scanning (non-CSS context: style={{ color: "#fff" }}) requires an eslint rule, not just stylelint. The JSX scanning half is partially bespoke.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'stylelint covers CSS files. For TSX style props, eslint-plugin-react or a custom eslint rule with a regex pattern covers the same surface. Combined, they replace the 240-LOC custom script.',
  },

  'check-hardcoded-spacing': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint stylelint-declaration-property-value-allowed-list',
      configEffort: 'small',
      exampleConfig:
        '// Reject raw px values in margin/padding: { "declaration-property-value-allowed-list": { padding: ["/^var\\(--hds-/"] } }',
    },
    keepReason:
      'The HDS-specific token namespace (var(--hds-space-*)) must be validated against hirobius.tokens.json. stylelint can enforce the pattern but cannot verify the token path exists.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'stylelint blocks raw px in spacing props. Token-existence check stays in check-token-paths-ratchet. Recommended: replace 163-LOC scanner with stylelint rule + fold token-path checks into existing ratchet.',
  },

  'check-css-integrity': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint',
      configEffort: 'small',
      exampleConfig:
        '// Custom stylelint plugin that reads hirobius.tokens.json at lint-time and validates var() references',
    },
    keepReason:
      'Sync validation between theme.css bridge vars and hirobius.tokens.json values requires reading the token JSON. No off-the-shelf tool does this — Style Dictionary does it at build time but not at lint time.',
    migrationCost: 'medium',
    coverageGain: 'equal',
    notes:
      'This is the canonical argument for Style Dictionary: SD builds CSS from the token source, eliminating drift by construction. Flag for "Adjacent reinvention" section.',
  },

  'check-hardcoded-breakpoints': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'eslint custom rule / eslint-plugin-no-magic-numbers',
      source: 'https://eslint.org/docs/rules/no-magic-numbers',
      npmPackage: 'eslint',
      configEffort: 'trivial',
      exampleConfig:
        '// eslint no-magic-numbers with ignore list; or a project-local rule detecting known px breakpoint values',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'The custom gate is ~122 LOC catching raw px breakpoint comparisons. A single eslint rule with the known breakpoint values as forbidden magic numbers covers this entirely.',
  },

  'check-dimensions': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'stylelint / eslint custom rule',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint',
      configEffort: 'trivial',
      exampleConfig:
        '// Stylelint: unit-allowed-list or declaration-property-unit-disallowed-list for px in width/height',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'Raw px in style={{ width }} is a 2-line regex check. stylelint or a micro eslint rule replaces the 124-LOC custom script.',
  },

  // ── Link gates ──────────────────────────────────────────────────────────────

  'check-link-integrity': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'lychee / markdown-link-check',
      source: 'https://github.com/lycheeverse/lychee',
      npmPackage: 'markdown-link-check',
      configEffort: 'small',
      exampleConfig:
        '// .lychee.toml\n[anchor]\ncheck = true\n[links]\nexclude_patterns = ["localhost"]',
    },
    keepReason:
      "Route-link checking (internal React Router routes) requires awareness of the app's router config. Lychee handles HTTP URLs and file references but cannot validate SPA route strings against router.tsx.",
    migrationCost: 'small',
    coverageGain: 'higher',
    notes:
      'Lychee covers external URL liveness (404 detection) and local file refs in markdown. The route-link sub-mode is custom. Recommended: use lychee for external + doc refs, keep a lean custom check for route strings only.',
  },

  // ── Doc / Markdown gates ────────────────────────────────────────────────────

  'check-doc-structure': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'markdownlint / vale',
      source: 'https://github.com/DavidAnson/markdownlint',
      npmPackage: 'markdownlint-cli2',
      configEffort: 'small',
      exampleConfig: '// .markdownlint.yaml\nrequired-headings: true\nno-empty-sections: true',
    },
    keepReason:
      'The HDS doc page structure check validates TSX files (DocPageHeader component usage in React), not markdown. markdownlint only processes .md files. The TSX structural invariant is custom.',
    migrationCost: 'small',
    coverageGain: 'lower',
    notes:
      'For .md docs, markdownlint replaces the check. For HDS doc page TSX structure (DocPageHeader, required sections), no industry tool exists. Split into: markdownlint for .md, micro custom rule for TSX doc structure.',
  },

  'check-attributions': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'ATTRIBUTIONS.md machine-checkable registry with asset manifest sourceId cross-referencing is a project-specific contract. No industry tool manages attribution registries in this format.',
    migrationCost: null,
    coverageGain: null,
    notes:
      'Genuinely custom. But consider whether this complexity is worth the maintenance cost vs. a simpler convention (asset filenames as attribution keys).',
  },

  // ── Bundle / Perf gates ──────────────────────────────────────────────────────

  'check-perf-budget': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'size-limit',
      source: 'https://github.com/ai/size-limit',
      npmPackage: 'size-limit @size-limit/vite',
      configEffort: 'small',
      exampleConfig: '// .size-limit.json\n[{ "path": "dist/hirobius-ui.js", "limit": "80 KB" }]',
    },
    keepReason: null,
    migrationCost: 'small',
    coverageGain: 'higher',
    notes:
      'size-limit integrates natively with Vite, tracks gzipped/brotli sizes, and runs in CI with PR comments. The custom script (~239 LOC) reimplements a fraction of this. size-limit also covers core-web-vitals budgets via lighthouse integration.',
  },

  'audit-bundle': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'vite-bundle-visualizer / rollup-plugin-visualizer',
      source: 'https://github.com/btd/rollup-plugin-visualizer',
      npmPackage: 'rollup-plugin-visualizer',
      configEffort: 'trivial',
      exampleConfig:
        '// vite.config.mjs: plugins: [visualizer({ open: true, filename: "dist/bundle-report.html" })]',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'The custom script already uses vite-bundle-visualizer as an external tool. Rolling the call directly into the vite config as a plugin eliminates the wrapper script.',
  },

  // ── License / Dependency gates ────────────────────────────────────────────────

  'check-licenses': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'license-checker-rseidelsohn / licensee',
      source: 'https://github.com/nicolo-ribaudo/licensee',
      npmPackage: 'license-checker-rseidelsohn',
      configEffort: 'trivial',
      exampleConfig:
        '// license-checker --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0;CC0-1.0"',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'license-checker-rseidelsohn wraps pnpm/npm license output with --onlyAllow and --failOn flags — exactly what the custom ~87 LOC script does manually. Direct replacement.',
  },

  'audit-deps': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'pnpm audit (native) / socket.dev',
      source: 'https://socket.dev',
      npmPackage: null,
      configEffort: 'trivial',
      exampleConfig:
        '// package.json scripts: "audit:deps": "pnpm audit --audit-level moderate --prod"',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'The custom gate (~64 LOC) wraps pnpm audit. Replace with direct pnpm audit invocation in CI. socket.dev provides supply-chain analysis beyond vulnerability scanning if needed.',
  },

  // ── Schema / Manifest gates ────────────────────────────────────────────────

  'check-manifest-schema-semver': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'ajv + json-schema-diff',
      source: 'https://github.com/Zod-ar/json-schema-diff',
      npmPackage: 'ajv json-schema-diff',
      configEffort: 'small',
      exampleConfig: '// Use json-schema-diff to detect breaking changes between schema versions',
    },
    keepReason:
      'The semver classification logic (breaking vs. non-breaking schema delta) is custom. json-schema-diff detects the diff but does not classify it as semver-breaking.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'json-schema-diff handles the diff detection (reducing LOC). The semver verdict logic can be reduced to ~30 lines. Total: ~158 LOC → ~40 LOC hybrid.',
  },

  'check-token-structure': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'Style Dictionary (W3C DTCG mode) / ajv',
      source: 'https://amzn.github.io/style-dictionary',
      npmPackage: '@tokens-studio/sd-transforms style-dictionary',
      configEffort: 'medium',
      exampleConfig:
        '// Style Dictionary with W3C DTCG schema validation validates token structure by construction',
    },
    keepReason:
      'HDS-specific cross-tier aliasing rules (primitive → semantic → component) and theme coverage gaps go beyond standard W3C DTCG validation. The tier hierarchy is a custom structural contract.',
    migrationCost: 'medium',
    coverageGain: 'equal',
    notes:
      'Style Dictionary validates W3C DTCG format and catches circular refs. Tier-hierarchy enforcement stays custom. See "Adjacent reinvention" — build-tokens.mjs itself should migrate to Style Dictionary.',
  },

  'check-token-descriptions': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Token description quality checks (missing/blank/verbose/one-sided-theme-language) are specific to the HDS LLM-output-quality mandate. No industry tool validates token description prose quality.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom — and high-value for the LLM pipeline. Keep.',
  },

  'check-token-paths-ratchet': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates HDS-specific design token path syntax ({primitive.color.x.y}) in source files against the live token graph. No industry tool performs this cross-file token-path resolution + monotonic ratchet.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core gate for the token system. Keep.',
  },

  'check-token-rebake-needed': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Guards that build-tokens.mjs has been re-run after hirobius.tokens.json changes. If Style Dictionary replaced build-tokens.mjs, this gate would be replaced by the SD build step itself.',
    migrationCost: null,
    coverageGain: null,
    notes:
      'This gate dissolves naturally if Style Dictionary is adopted (SD generates outputs deterministically; a hash-check in CI replaces the custom "needs rebake" logic).',
  },

  'check-token-renames': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Compares current token paths against tokens.lock.json baseline to detect renames/deletions requiring migrations. No industry tool manages HDS-format token-path migration contracts.',
    migrationCost: null,
    coverageGain: null,
    notes:
      'Keep. Style Dictionary has no token-rename migration tracking. If SD is adopted, this gate could be enhanced to validate SD migration files.',
  },

  'check-css-integrity': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'Style Dictionary',
      source: 'https://amzn.github.io/style-dictionary',
      npmPackage: 'style-dictionary',
      configEffort: 'medium',
      exampleConfig:
        '// SD generates theme.css from hirobius.tokens.json — drift is impossible by construction',
    },
    keepReason:
      'Until Style Dictionary is adopted, the sync check between hand-authored theme.css and hirobius.tokens.json is still needed.',
    migrationCost: 'medium',
    coverageGain: 'higher',
    notes:
      'This gate exists because theme.css is hand-authored. Style Dictionary would generate it, making this gate unnecessary. Gate and build-tokens.mjs both point to the same root cause.',
  },

  // ── Visual regression gates ────────────────────────────────────────────────

  'check-frozen-demos': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'Chromatic / Percy',
      source: 'https://www.chromatic.com',
      npmPackage: null,
      configEffort: 'large',
      exampleConfig: '// npx chromatic --project-token=<token> in CI',
    },
    keepReason:
      'The "frozen demo" contract (doc pages must not have hand-authored bespoke previews) is a code-structure rule, not a visual snapshot rule. Chromatic catches visual changes but not the architectural constraint.',
    migrationCost: 'large',
    coverageGain: 'higher',
    notes:
      'Chromatic/Percy provide visual snapshot regression which is complementary and superior for catching unintended visual changes. The code-structure check (no bespoke previews) is genuinely custom. These are different concerns.',
  },

  // ── Secrets gate ──────────────────────────────────────────────────────────

  'check-secrets': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'gitleaks (already in use)',
      source: 'https://github.com/gitleaks/gitleaks',
      npmPackage: null,
      configEffort: 'trivial',
      exampleConfig: '// Already implemented — the custom wrapper just invokes the gitleaks binary',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'The custom gate (~94 LOC) is already a thin wrapper around gitleaks. The wrapper itself is minimal value — a direct git hook invoking gitleaks achieves the same result. Keep as-is or replace with direct gitleaks pre-commit hook.',
  },

  'check-security-baseline': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'gitleaks + snyk / socket.dev',
      source: 'https://snyk.io',
      npmPackage: null,
      configEffort: 'small',
      exampleConfig: '// snyk test --severity-threshold=high in CI',
    },
    keepReason:
      'The "no CDN imports, no dangerous innerHTML patterns" checks are codebase-specific heuristics. Snyk covers dependency vulnerabilities but not in-source injection patterns.',
    migrationCost: 'small',
    coverageGain: 'higher',
    notes:
      'Split: use snyk/socket.dev for dep vulns (replacing the audit-deps overlap), keep a small custom scan for CDN imports and innerHTML injection patterns (~30 LOC instead of ~264 LOC).',
  },

  // ── SBOM gate ─────────────────────────────────────────────────────────────

  'audit-sbom': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: '@cyclonedx/cyclonedx-npm (already in use)',
      source: 'https://github.com/CycloneDX/cyclonedx-node-npm',
      npmPackage: '@cyclonedx/cyclonedx-npm',
      configEffort: 'trivial',
      exampleConfig:
        '// package.json: "audit:sbom": "cyclonedx-npm --output-file docs/security/sbom.json"',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'The custom wrapper (~52 LOC) just invokes cyclonedx-npm. Replace with a direct npm script. Already identified in the unit spec (post-13y-0).',
  },

  // ── Meta-validators (genuinely custom) ────────────────────────────────────

  'audit-soft-gates': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Reads the HDS-specific registry.json and classifies gates by promotion-readiness. No industry equivalent for this self-governance pattern.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep.',
  },

  'audit-batch-deliverables': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates AI agent batch deliverables against orchestration.json specs. Unique to the HDS agentic build pipeline.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core orchestration gate. Keep.',
  },

  'audit-claims': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Detects stale agent claims in orchestration.json. No industry tool manages AI-agent work claiming/unclaiming state.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core orchestration gate. Keep.',
  },

  'audit-gate-purity': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      "Audits gate scripts for non-determinism (fs writes, Date.now, network calls). No industry tool validates other tools's purity.",
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep.',
  },

  'audit-gates-supportjson': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Ratchets --json compliance across the gate inventory. Self-referential meta-gate with no industry equivalent.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep.',
  },

  'audit-strengths': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates that documented differentiators in strengths-and-differentiators.md are still real. Project-specific narrative integrity check.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Keep.',
  },

  'audit-tiers': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'HDS-specific component tier classification (primitive/pattern/utility). No industry equivalent for design-system tier governance.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS governance. Keep.',
  },

  'audit-tokens': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'Style Dictionary',
      source: 'https://amzn.github.io/style-dictionary',
      npmPackage: 'style-dictionary',
      configEffort: 'medium',
      exampleConfig:
        '// SD validates token format + resolves aliases at build time, catching structural errors early',
    },
    keepReason:
      'HDS-specific semantic tier compliance checks (hardcoded hex/rgba in component files) go beyond what SD validates.',
    migrationCost: 'medium',
    coverageGain: 'equal',
    notes:
      'About 60% of this ~1130 LOC gate is generic token validation that Style Dictionary covers. The HDS-specific surface (component-level token compliance) is the residual custom logic.',
  },

  'audit-exceptions': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Audits all exemption sentinels across the codebase (eslint-disable, @ts-ignore, custom *-ok markers). Counts/classifies project-specific suppression markers — no industry tool tracks HDS-specific sentinels like spacing-ok, binding-ok, hds-bypass.',
    migrationCost: null,
    coverageGain: null,
    notes:
      "Keep. Consider ESLint's built-in --report-unused-disable-directives for the eslint-disable subset, but the HDS custom sentinel audit is genuinely custom.",
  },

  'audit-figma-system': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Compares repo tokens against Figma variable exports. Figma-sync is HDS-specific with no industry standard tool for this comparison.',
    migrationCost: null,
    coverageGain: null,
    notes:
      "Could be supplemented by Figma's own token sync tooling (tokens-studio plugin) but the custom sync logic is needed regardless.",
  },

  'audit-pages': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint',
      configEffort: 'small',
      exampleConfig: '// Looser stylelint config for pages vs. components',
    },
    keepReason:
      'The "pages are intentionally looser than components" distinction requires reading the HDS page vs. component directory structure and applying different rule sets. stylelint can approximate this with config overrides.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'stylelint with per-directory config (overrideConfig) can apply different strictness to src/app/pages vs. src/app/components, replacing most of this gate.',
  },

  // ── Component-specific gates ───────────────────────────────────────────────

  'audit-component-integrity': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: '@microsoft/api-extractor + axe-core',
      source: 'https://api-extractor.com',
      npmPackage: '@microsoft/api-extractor',
      configEffort: 'medium',
      exampleConfig:
        '// api-extractor.json: mainEntryPointFilePath + dtsRollup for API surface guard',
    },
    keepReason:
      'The --completeness and --docs sub-modes check HDS-specific manifest entries and doc page coverage. These have no industry equivalent. The --api sub-mode is partially replaceable by api-extractor.',
    migrationCost: 'medium',
    coverageGain: 'higher',
    notes:
      'api-extractor covers the API surface guard (--api mode) better than the custom baseline diff. --completeness and --docs are custom. --tokens overlaps with audit-tokens.',
  },

  'check-motion': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Enforces HDS motion feedback mandate (every interactive element has a token-timed response). No industry tool validates this design-system behavioral contract.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS contract. Keep.',
  },

  'check-typography-discipline': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint',
      configEffort: 'small',
      exampleConfig:
        '// stylelint font-family-no-missing-generic-family-keyword + custom property enforcement',
    },
    keepReason:
      'The @font-face url() path resolution and the fontWeight/textTransform override policy are HDS-specific. stylelint covers generic font-family rules but not the HDS-specific single-weight + casing-via-eyebrow contract.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'stylelint covers ~50% of this gate. The HDS-specific font discipline rules stay custom.',
  },

  'check-mono-roles': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Prevents raw monospace in prose surfaces — enforces HDS InlineCode component usage. No industry equivalent for component-usage enforcement of this kind.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Small gate (~62 LOC) — keep.',
  },

  'check-page-shell': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Forbids direct Container usage in pages, enforcing Page wrapper usage. Pure HDS architecture contract with no industry equivalent.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Keep. Small gate (~60 LOC), catches a real architectural regression.',
  },

  'check-ref-forwarding': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates forwardRef usage on HDS form control components. No standard tool enforces this component-API contract.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Keep. Small gate (~105 LOC).',
  },

  'check-tier-bypass': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Enforces primitive → semantic → component CSS var aliasing hierarchy. Unique to HDS token tier architecture.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS token governance. Keep.',
  },

  'check-legacy-hds-vars': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Flags deprecated --hds-text/dim/subtle CSS vars. Pure HDS migration guard with no industry equivalent.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Keep until migration is complete, then delete.',
  },

  'check-binding-drift': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Detects when component-tier CSS vars are referenced without corresponding masters pipeline bindings. HDS pipeline-specific.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS pipeline gate. Keep.',
  },

  'check-brand': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates that living documentation files reflect current brand values from hirobius.tokens.json. Project-specific cross-file consistency check.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom but consider whether vale + custom rules could approximate this.',
  },

  // ── Code quality / coverage gates ─────────────────────────────────────────

  'check-format-staged': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'prettier + lint-staged',
      source: 'https://prettier.io',
      npmPackage: 'prettier lint-staged',
      configEffort: 'trivial',
      exampleConfig:
        '// package.json: "lint-staged": { "*.{ts,tsx,css,json}": "prettier --write" }',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      'lint-staged with prettier is the industry standard for staged-file formatting. The custom gate (~95 LOC) reimplements this. lint-staged also integrates with husky/simple-git-hooks automatically.',
  },

  'check-knip-ratchet': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'knip (already in use) + direct CI integration',
      source: 'https://knip.dev',
      npmPackage: 'knip',
      configEffort: 'trivial',
      exampleConfig:
        '// package.json: "check:knip": "knip" — knip already supports --max-issues flag for ratcheting',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      "The wrapper ratchet is ~121 LOC around knip which already provides --max-issues. The custom baseline file could be replaced with knip's native baseline support.",
  },

  'check-type-coverage-ratchet': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'type-coverage',
      source: 'https://github.com/plantain-00/type-coverage',
      npmPackage: 'type-coverage',
      configEffort: 'trivial',
      exampleConfig: '// npx type-coverage --strict --at-least 95',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'type-coverage is the industry standard for this metric and supports --at-least for ratcheting. The ~99 LOC custom wrapper reimplements what the CLI provides.',
  },

  'check-lockfile-integrity': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'pnpm install --frozen-lockfile (already used internally)',
      source: 'https://pnpm.io',
      npmPackage: null,
      configEffort: 'trivial',
      exampleConfig:
        '// In CI: pnpm install --frozen-lockfile\n// Pre-commit: add to husky/simple-git-hooks directly',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'The custom gate is already just `pnpm install --frozen-lockfile --offline`. Can be a one-line shell command in .husky/pre-commit without a wrapper script.',
  },

  'check-mojibake': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'editorconfig + file encoding linting',
      source: 'https://editorconfig.org',
      npmPackage: 'editorconfig-checker',
      configEffort: 'trivial',
      exampleConfig:
        '// .editorconfig: charset = utf-8\n// npx editorconfig-checker --exclude build/',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'equal',
    notes:
      'editorconfig-checker enforces UTF-8 encoding on all files. The custom gate (~166 LOC) detects the same broken sequences.',
  },

  // ── Orchestration / registry meta-gates ────────────────────────────────────

  'check-validator-wiring': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates that registry.json firingChannels match actual invocation (git hooks + CI workflows). No industry tool understands the HDS registry schema.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep.',
  },

  'check-fixture-stubs-ratchet': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Ratchets the count of stub fixtures downward. HDS-specific fixture governance with no industry equivalent.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep.',
  },

  'check-exemptions': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates HDS-specific exemption markers (// aria-ok:, // spacing-ok: etc.) are well-formed. No industry tool manages project-specific inline suppression markers.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Keep.',
  },

  'check-unit-overlap': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Pre-dispatch AI agent file-overlap detector. Unique to the HDS agentic build pipeline.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core orchestration gate. Keep.',
  },

  'check-source-canon': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Runs HDS Swiss-canon rules on hand-authored TSX files. The canon ruleset is a project-specific quality contract for LLM output quality.',
    migrationCost: null,
    coverageGain: null,
    notes:
      'Core HDS quality gate. Could be an eslint custom plugin, but the rules themselves are custom.',
  },

  'check-unresponsive-grids': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'stylelint',
      source: 'https://stylelint.io',
      npmPackage: 'stylelint',
      configEffort: 'small',
      exampleConfig: '// Custom stylelint rule: grid-template-columns without @media query wrapper',
    },
    keepReason:
      'The JS isMobile guard check (JSX-side responsive pattern) is HDS-specific. stylelint only covers CSS.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes: 'The CSS side can be a stylelint rule. The JSX isMobile guard is custom.',
  },

  'check-og-meta': {
    verdict: 'fully-replaceable',
    replacement: {
      tool: 'html-validate / metatag validators',
      source: 'https://html-validate.org',
      npmPackage: 'html-validate',
      configEffort: 'trivial',
      exampleConfig: '// html-validate with og-meta ruleset on built index.html',
    },
    keepReason: null,
    migrationCost: 'trivial',
    coverageGain: 'higher',
    notes:
      "html-validate covers OG meta tag validation. The custom script (~121 LOC) checks a fixed list; html-validate's ruleset is more comprehensive.",
  },

  'check-route-coverage': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates that every routable page appears in the layout-integrity test set. HDS-specific test coverage enforcement.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Keep.',
  },

  'check-route-smoke': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'Playwright / Vitest browser mode',
      source: 'https://playwright.dev',
      npmPackage: '@playwright/test',
      configEffort: 'medium',
      exampleConfig: '// playwright.config.ts: list of routes to smoke-test after vite preview',
    },
    keepReason: null,
    migrationCost: 'medium',
    coverageGain: 'higher',
    notes:
      'Playwright covers runtime route smoke tests more thoroughly (real browser, not fetch). The custom gate is ~110 LOC; Playwright provides proper browser rendering.',
  },

  'check-code-connect': {
    verdict: 'partially-replaceable',
    replacement: {
      tool: 'Figma Code Connect CLI',
      source: 'https://www.figma.com/developers/code-connect',
      npmPackage: '@figma/code-connect',
      configEffort: 'small',
      exampleConfig: '// npx figma connect publish --dry-run to check mapping coverage',
    },
    keepReason:
      'Bidirectional parity check (React ↔ Figma) goes beyond what the Figma CLI validates by default.',
    migrationCost: 'small',
    coverageGain: 'equal',
    notes:
      'Figma Code Connect CLI validates .figma.tsx files structurally. The bidirectional coverage check is partially custom.',
  },

  'check-template-source-of-truth': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Prevents direct edits to auto-generated output files by checking generator + output co-modification. No industry equivalent for this custom generator-output tracking.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Keep.',
  },

  'check-manifest-drift': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Checks HDS-specific hds-manifest.json drift against component source. No industry tool manages design-system manifest drift.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS governance. Keep.',
  },

  'check-tenant-tokens': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates per-tenant token override files against HDS structural rules. Multi-tenant token system is HDS-specific.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS multi-tenant governance. Keep.',
  },

  'check-registry': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates hds-registry.json completeness and page file coverage. HDS-specific registry governance.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core HDS governance. Keep.',
  },

  'check-asset-manifest': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Guards asset manifest entries against live public/assets files. HDS-specific asset slot system with no industry equivalent.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Keep.',
  },

  // ── Meta-validators (framework) ────────────────────────────────────────────

  'validate-fixture-proof-of-firing': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Meta-validator that walks registry.json and proves every gate has passing + violating fixture pairs. No industry equivalent for this self-proving gate system.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep. This is one of the most valuable gates in the system.',
  },

  'validate-orchestration': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Validates HDS orchestration.json schema for AI agent coordination. No industry tool manages AI agent orchestration state validation.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core orchestration gate. Keep.',
  },

  'generate-strength-report': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason:
      'Computes HDS-specific Internal Integrity + Industry Benchmark scores from registry.json and orchestration.json. No industry equivalent for this meta-scoring system.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Core meta-governance. Keep.',
  },

  // ── This script itself ─────────────────────────────────────────────────────
  'audit-gate-replaceability': {
    verdict: 'genuinely-custom',
    replacement: {
      tool: null,
      source: null,
      npmPackage: null,
      configEffort: null,
      exampleConfig: null,
    },
    keepReason: 'This audit script itself. Meta-planning artifact for HDS gate rationalization.',
    migrationCost: null,
    coverageGain: null,
    notes: 'Genuinely custom. Keep as ongoing audit tool.',
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────

function run() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const gates = registry.gates;

  const results = gates.map((gate) => {
    const loc = getScriptLOC(gate.gateScript);
    const lookup = REPLACEMENT_TABLE[gate.id];

    if (lookup) {
      return {
        id: gate.id,
        gateScript: gate.gateScript,
        severity: gate.severity,
        firingChannel: gate.firingChannel,
        currentLOC: loc,
        verdict: lookup.verdict,
        replacement: lookup.replacement,
        keepReason: lookup.keepReason,
        migrationCost: lookup.migrationCost,
        coverageGain: lookup.coverageGain,
        notes: lookup.notes,
      };
    }

    // Fallback for any gates not in the lookup table
    return {
      id: gate.id,
      gateScript: gate.gateScript,
      severity: gate.severity,
      firingChannel: gate.firingChannel,
      currentLOC: loc,
      verdict: 'genuinely-custom',
      replacement: {
        tool: null,
        source: null,
        npmPackage: null,
        configEffort: null,
        exampleConfig: null,
      },
      keepReason: `Not found in replaceability lookup table — defaulting to genuinely-custom. Manual review needed.`,
      migrationCost: null,
      coverageGain: null,
      notes: 'Add to REPLACEMENT_TABLE in audit-gate-replaceability.mjs for accurate verdict.',
    };
  });

  // Counts
  const fullyReplaceable = results.filter((r) => r.verdict === 'fully-replaceable');
  const partiallyReplaceable = results.filter((r) => r.verdict === 'partially-replaceable');
  const genuinelyCustom = results.filter((r) => r.verdict === 'genuinely-custom');

  const output = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    counts: {
      'fully-replaceable': fullyReplaceable.length,
      'partially-replaceable': partiallyReplaceable.length,
      'genuinely-custom': genuinelyCustom.length,
    },
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  if (SUMMARY_MODE) {
    console.log('\n═══ Gate Replaceability Audit ═══════════════════════════════════════');
    console.log(`Total gates: ${output.total}`);
    console.log(`  Fully replaceable:    ${fullyReplaceable.length}`);
    console.log(`  Partially replaceable:${partiallyReplaceable.length}`);
    console.log(`  Genuinely custom:     ${genuinelyCustom.length}`);
    console.log(`\nFull report → ${OUTPUT_PATH}\n`);

    console.log('─── Fully Replaceable (sorted by migrationCost) ──────────────────────');
    const order = { trivial: 0, small: 1, medium: 2, large: 3 };
    const sorted = [...fullyReplaceable].sort(
      (a, b) => (order[a.migrationCost] ?? 99) - (order[b.migrationCost] ?? 99),
    );
    console.log(`${'Gate ID'.padEnd(35)} ${'Replace With'.padEnd(30)} Cost     LOC`);
    console.log('─'.repeat(85));
    for (const r of sorted) {
      const tool = r.replacement?.tool ?? 'n/a';
      console.log(
        `${r.id.padEnd(35)} ${tool.slice(0, 30).padEnd(30)} ${(r.migrationCost ?? 'n/a').padEnd(8)} ${r.currentLOC}`,
      );
    }

    console.log('\n─── Partially Replaceable ────────────────────────────────────────────');
    console.log(`${'Gate ID'.padEnd(35)} ${'Replace With'.padEnd(30)} Cost     LOC`);
    console.log('─'.repeat(85));
    for (const r of [...partiallyReplaceable].sort(
      (a, b) => (order[a.migrationCost] ?? 99) - (order[b.migrationCost] ?? 99),
    )) {
      const tool = r.replacement?.tool ?? 'n/a';
      console.log(
        `${r.id.padEnd(35)} ${tool.slice(0, 30).padEnd(30)} ${(r.migrationCost ?? 'n/a').padEnd(8)} ${r.currentLOC}`,
      );
    }

    console.log('\n─── Genuinely Custom (keep) ──────────────────────────────────────────');
    console.log(`${'Gate ID'.padEnd(40)} LOC    Reason (truncated)`);
    console.log('─'.repeat(80));
    for (const r of genuinelyCustom) {
      const reason = (r.keepReason ?? '').slice(0, 50);
      console.log(`${r.id.padEnd(40)} ${String(r.currentLOC).padEnd(6)} ${reason}`);
    }
    console.log('');
  } else {
    console.log(`Gate replaceability audit complete → ${OUTPUT_PATH}`);
    console.log(
      `Total: ${output.total} | Fully replaceable: ${fullyReplaceable.length} | Partial: ${partiallyReplaceable.length} | Custom: ${genuinelyCustom.length}`,
    );
  }
}

run();
