// Fixture for check-typecheck proof-of-firing: stands in for `pnpm run typecheck`
// finding a type error. tsc exits 2 (not 1) on type errors — the gate must still
// read that as a failure.
console.log(
  "src/app/pages/ops/Example.tsx(12,7): error TS2322: Type 'string' is not assignable to type 'number'.",
);
process.exit(2);
