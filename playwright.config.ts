import { defineConfig, devices } from '@playwright/test';

/** Build output the Playwright web server owns — see `webServer` below. */
const PREVIEW_OUT_DIR = 'node_modules/.cache/playwright-preview';

export default defineConfig({
  testDir: './tests',
  // Repo convention: `.spec.ts` = Playwright e2e, `.test.{ts,tsx}` = Vitest
  // unit/contract tests (see vitest.config.ts). Playwright's default
  // testMatch also globs up `*.test.*`, which pulls in the Vitest-owned
  // files here too — they import `vitest`, which crashes the runner
  // (double registration of the shared jest-matchers-object symbol) and/or
  // fails to resolve Vitest-only deps like @testing-library/react. Scope
  // Playwright to its own naming convention instead.
  testMatch: '**/*.spec.ts',
  // check-source-canon.spec.ts is itself mislabeled — it's a Vitest suite
  // (imports `describe`/`it`/`expect` from 'vitest') for a validator script
  // that no longer exists (removed in #17, de-authoring the design system).
  // It matches testMatch by name but would crash the runner the same way;
  // ignore it here rather than rename it into a Vitest run it can't pass.
  testIgnore: '**/check-source-canon.spec.ts',
  timeout: 30_000,
  // 10o-11: retries: 0 → 2. Long-running visual.spec (~7 min, 77 tests) hits
  // intermittent vite dev-server crashes and HMR-triggered page reloads.
  // Two retries lets the test re-attempt against the recovered server. Stable
  // tests are unaffected (only failed tests retry).
  retries: 2,
  reporter: 'list',
  // Block default baseline rewriting; baselines only update via explicit --update-snapshots.
  // (Prevents the silent baseline drift flagged in backlog-2 and multiple agent reports.)
  updateSnapshots: 'none',
  use: {
    baseURL: 'http://localhost:5200',
    trace: 'on-first-retry',
  },
  // 10o-11: switched from `vite dev` to `vite build && vite preview`. The dev
  // server proved unstable across long test runs (~7-min visual.spec) — vite's
  // HMR pipeline crashed under file-watch pressure, producing intermittent
  // ERR_CONNECTION_REFUSED + blank actuals on late-Block-B tests. preview
  // serves the static bundle, no HMR, no file watching, no crash class.
  // reuseExistingServer: true — if already serving on 5200, reuse.
  //
  // PR #382 review: build into, and preview, PREVIEW_OUT_DIR — never Vite's
  // default dist/. In the parallel ci-pr run other processes rebuild dist/
  // (audit-gates-supportjson probes audit-bundle, and Vite empties outDir
  // mid-build), so previewing dist/ could serve a 404 shell to a layout test
  // mid-run. Under node_modules/ so git and every tree-walking gate skip the
  // bundle. scripts/__tests__/quality-workflow.test.mjs pins this.
  webServer: {
    command: `pnpm build --outDir ${PREVIEW_OUT_DIR} && npx vite preview --outDir ${PREVIEW_OUT_DIR} --host 127.0.0.1 --port 5200`,
    url: 'http://localhost:5200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
