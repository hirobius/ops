// Fixture for check-editorconfig proof-of-firing: stands in for a real
// editorconfig-checker violation (not the binary-unavailable marker), so
// the guard must forward this as a failure rather than skip it.
console.log('src/App.tsx:12: trailing whitespace');
process.exit(1);
