#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-type-coverage.mjs
 *
 * Type-coverage floor as a ci-pr registry gate: runs
 * `pnpm run check:type-coverage` (type-coverage --at-least 99.9) and fails when
 * coverage drops below the floor. Replaces the bespoke "Type coverage" step in
 * .github/workflows/quality.yml so CI reaches it through run-gates.mjs (ops#241).
 * The threshold lives in package.json's check:type-coverage script only.
 *
 * Mechanics (modes, exit codes, fixture proof) live in scripts/lib/command-gate.mjs.
 *
 * Usage: node scripts/check-type-coverage.mjs [--json]
 */
import { runCommandGate, COMMAND_GATES } from './lib/command-gate.mjs';

const id = 'check-type-coverage';
process.exit(runCommandGate({ id, command: COMMAND_GATES[id] }));
