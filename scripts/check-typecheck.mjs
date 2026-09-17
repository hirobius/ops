#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-typecheck.mjs
 *
 * Whole-program TypeScript typecheck as a ci-pr registry gate: runs
 * `pnpm run typecheck` (tsc --noEmit -p tsconfig.typecheck.json) and fails on
 * any type error. Replaces the bespoke "Typecheck" step in
 * .github/workflows/quality.yml so CI reaches it through run-gates.mjs (ops#241).
 *
 * Mechanics (modes, exit codes, fixture proof) live in scripts/lib/command-gate.mjs.
 *
 * Usage: node scripts/check-typecheck.mjs [--json]
 */
import { runCommandGate, COMMAND_GATES } from './lib/command-gate.mjs';

const id = 'check-typecheck';
process.exit(runCommandGate({ id, command: COMMAND_GATES[id] }));
