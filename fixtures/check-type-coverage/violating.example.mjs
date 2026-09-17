// Fixture for check-type-coverage proof-of-firing: stands in for
// `pnpm run check:type-coverage` reporting coverage below the --at-least floor.
console.log('(17800 / 17860) 99.66%');
console.error('The type coverage rate(99.66%) is lower than the target(99.9%).');
process.exit(1);
