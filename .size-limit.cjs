/**
 * .size-limit.cjs — per-chunk bundle budgets for the Hirobius portfolio app.
 *
 * HARD-FAIL MODE: promoted from warn-mode after 2 clean PRs confirmed headroom
 * (2026-05-03, unit 12o-perf-bundle-budget-hard-fail-promote).
 * CI will fail the merge if any chunk exceeds its budget — this is intentional.
 * To update a budget, measure a new baseline and justify the change in the PR.
 *
 * Baseline (gzip, post three.js split, 2026-05-01):
 *   index (main entry)   : 66.81 kB  -> budget 75 kB
 *   vendor-react         : 77.78 kB  -> budget 86 kB
 *   vendor-three         : 267.35 kB -> budget 295 kB
 *   vendor-motion        : 41.46 kB  -> budget 46 kB
 *   vendor-icons         : 5.43 kB   -> budget 6 kB
 *   _virtual_hds-manifest: 36.81 kB  -> budget 41 kB
 *
 * Architecture decisions: docs/architecture/bundle-budget-decision.md
 */

module.exports = [
  {
    name: 'main entry',
    path: 'dist/assets/index-*.js',
    limit: '75 kB',
    gzip: true,
  },
  {
    name: 'vendor-react',
    path: 'dist/assets/vendor-react-*.js',
    limit: '86 kB',
    gzip: true,
  },
  {
    name: 'vendor-three (lazy)',
    path: 'dist/assets/vendor-three-*.js',
    limit: '295 kB',
    gzip: true,
  },
  {
    name: 'vendor-motion',
    path: 'dist/assets/vendor-motion-*.js',
    limit: '46 kB',
    gzip: true,
  },
  {
    name: 'vendor-icons',
    path: 'dist/assets/vendor-icons-*.js',
    limit: '6 kB',
    gzip: true,
  },
  {
    name: 'virtual hds-manifest',
    path: 'dist/assets/_virtual_hds-manifest-*.js',
    limit: '41 kB',
    gzip: true,
  },
];
