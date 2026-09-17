#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-layout-tests.mjs
 *
 * Layout-integrity Playwright suite as a ci-pr registry gate: runs
 * `pnpm run test:layout` (check-route-coverage, then
 * tests/layout-integrity.spec.ts against a `vite build && vite preview` server
 * on :5200) and fails on any layout collision/overflow, blank render, or
 * uncovered route. The server builds into node_modules/.cache/playwright-preview,
 * never dist/, so the parallel ci-pr run cannot empty it mid-suite (see
 * playwright.config.ts).
 * Replaces the bespoke "Layout tests" step in .github/workflows/quality.yml so CI
 * reaches it through run-gates.mjs (ops#241). Needs the Chromium binary, which
 * quality.yml installs before invoking the runner.
 *
 * Mechanics (modes, exit codes, fixture proof) live in scripts/lib/command-gate.mjs.
 *
 * Usage: node scripts/check-layout-tests.mjs [--json]
 */
import { runCommandGate, COMMAND_GATES } from './lib/command-gate.mjs';

const id = 'check-layout-tests';
process.exit(runCommandGate({ id, command: COMMAND_GATES[id] }));
