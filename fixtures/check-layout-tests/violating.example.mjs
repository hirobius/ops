// Fixture for check-layout-tests proof-of-firing: stands in for
// `pnpm run test:layout` where the Playwright layout-integrity suite finds a
// collision.
console.log('  ✘  1 [chromium] › tests/layout-integrity.spec.ts:58:5 › layout integrity: /ops');
console.error('Error: UI COLLISION DETECTED: Sibling grid items are overlapping.');
console.log('  1 failed');
process.exit(1);
