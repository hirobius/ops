import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    // src/index.ts is auto-detected as the package entry; explicit entry was redundant.
    // src/main.tsx is auto-detected via index.html; no explicit entry needed.
    'src/app/App.tsx!',
    'src/app/routes.tsx!',   // lazy import() calls for all pages
    'scripts/**/*.mjs!',
    // Validator pipeline — entries to surface acorn/acorn-jsx + AST helpers
    // that knip's project graph cannot reach via the React app alone.
    'validators/**/*.mjs!',
    // Vitest + Playwright test files — entries so knip picks up
    // test-only imports (e.g. createMobiusStore + PRESETS in
    // tests/mobiusStore.test.ts, helpers/* in tests/*.spec.ts).
    'tests/**/*.{test,spec}.{ts,tsx}!',
    // Storybook stories — entries to a separate harness; knip can't trace
    // them via routes.tsx but they are real consumers of HDS components.
    'src/stories/**/*.stories.{ts,tsx}!',
  ],
  project: [
    'src/**/*.{ts,tsx}!',
    'scripts/**/*.mjs!',
    'validators/**/*.mjs!',
    'tests/**/*.{ts,tsx}!',
  ],
  ignore: [
    // Canvas sketches are intentional experiments — treat as live
    'src/app/pages/sketches/**',
    // Library subpath build entry — referenced by vite.config.lib.ts as a
    // rollup entry, not via TS imports, so Knip can't trace it.
    'src/lib/manifest-entry.ts',
    // Pattern / template doc scaffolds — kept as authoring templates for new
    // pattern + template doc pages. Not consumed yet; do not delete on cleanup.
    'src/app/pages/docs/patterns/_template.tsx',
    'src/app/pages/docs/templates/_template.tsx',
    // Draft HDS doc pages tracked by src/app/data/hds-registry.json but not
    // wired into routes.tsx yet. Each is a structured surface awaiting route
    // promotion in a future doc-pages cluster (9d-* line). Keeping them out
    // of knip noise — sync-hds-registry.mjs is the source of truth for status.
    'src/app/pages/hds/GettingStartedPage.tsx',
    'src/app/pages/hds/GuidancePage.tsx',
    'src/app/pages/hds/LicensePage.tsx',
    'src/app/pages/hds/TechStackPage.tsx',
    'src/app/pages/hds/TokenCascadeDiagram.tsx',
    'src/app/pages/hds/IconsPage.tsx',
    'src/app/pages/hds/portfolioData.tsx',
    'src/app/pages/SketchPage.tsx',
    // Admin/ops dashboard pages — in-flight Workspace HQ surfaces, not yet
    // wired into routes.tsx. Tracked by ops dashboard manifest.
    'src/app/pages/admin/**',
    // Pattern doc draft pages — same intent as the HDS draft pages above:
    // structured surfaces awaiting route promotion. Source of truth is the
    // hds-registry.json + pattern manifest, not knip's reachability graph.
    'src/app/pages/docs/patterns/HdsActivityFeed.tsx',
    'src/app/pages/docs/patterns/HdsDisclosure.tsx',
    'src/app/pages/docs/patterns/HdsField.tsx',
    'src/app/pages/docs/patterns/HdsFoundationSwatch.tsx',
    'src/app/pages/docs/patterns/HdsIconButton.tsx',
    // Generated files — knip should not report these as orphans
    'src/app/design-system/generated-tokens.ts',
    // Generated token descriptions — read directly from disk by
    // scripts/check-token-description-quality.mjs (filesystem consumer,
    // not a TS import).
    'src/app/design-system/generated-token-descriptions.ts',
  ],
  ignoreDependencies: [
    // Type-only consumer (JSDoc `@type {{ ... }}` in scripts/build-tokens.mjs);
    // the runtime tailwind plugin loaded by vite is `@tailwindcss/vite`.
    'tailwindcss',
    // Used only via npx in api-extractor scripts; not a runtime dep.
    '@microsoft/api-extractor',
    // Used in tests/primitive-contracts/*.contract.test.tsx — installed as a
    // transitive of @testing-library/dom. Treat as phantom dep until we
    // promote it to an explicit devDep.
    '@testing-library/react',
    // Storybook stories import this; Storybook itself is not yet wired into
    // the build, so the dep is phantom for now.
    '@storybook/react',
  ],
  ignoreBinaries: [
    // `npx tsx` is invoked from the test:figma script (Figma Make sync) and
    // is fetched on demand — intentionally not declared as a project dep.
    'tsx',
    // Knip mis-parses the `_comment:a11y-high-value` script entry in
    // package.json (it's a documentation comment, not a real script) and
    // treats the first token "The" as a binary. Ignore.
    'The',
  ],
  // Forward-looking exports (multi-tenant context, mobius constants, etc.)
  // and phantom devDeps for in-flight surfaces are intentional. Surface as
  // warnings so knip doesn't fail the pretest gate; real cleanup is tracked
  // separately and these stay visible in the warning list.
  rules: {
    exports: 'warn',
    types: 'warn',
    nsExports: 'warn',
    nsTypes: 'warn',
    unlisted: 'warn',
    binaries: 'warn',
    duplicates: 'warn',
    enumMembers: 'warn',
  },
};

export default config;
