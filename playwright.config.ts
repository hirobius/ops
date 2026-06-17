import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
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
  webServer: {
    command: 'pnpm build && npx vite preview --host 127.0.0.1 --port 5200',
    url: 'http://localhost:5200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
