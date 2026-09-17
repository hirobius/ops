/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/lib/command-gate.mjs
 *
 * Runs a package.json toolchain command (tsc, type-coverage, Playwright) as a
 * guardrail registry gate, so `.github/workflows/quality.yml` reaches it through
 * `run-gates.mjs --channel ci-pr` instead of a bespoke workflow step (ops#241).
 *
 * The wrapper's one job is to never change the verdict: the tool passing is the
 * only way to exit 0. Any non-zero tool exit (tsc reports type errors with 2), a
 * missing binary, or a signal kill exits 1; a malformed invocation exits 2.
 *
 *   COMMAND_GATES               id → the exact pnpm script the gate runs
 *   resolveInvocation({...})    pure: tool vs fixture vs invocation error
 *   runCommandGate({...})       spawn + report; returns the exit code (no exit)
 *
 * Modes:
 *   default    stream the tool's output live; exit 0/1.
 *   --json     capture output (re-emitted on stderr), print only the canonical
 *              { violations, summary, ok } on stdout (scripts/lib/gate-output.mjs).
 *   --fixture-mode + FIXTURE_FILE
 *              run `node <FIXTURE_FILE>` in place of the tool, so
 *              validate-fixture-proof-of-firing proves the pass/fail forwarding
 *              in milliseconds (same pattern as check-editorconfig). The argv
 *              flag is required — FIXTURE_FILE alone is ignored, so a stray env
 *              var can never swap a real CI run for a stub.
 *
 * @module command-gate
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hasJsonFlag, emitResult } from './gate-output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const FIXTURE_FLAG = '--fixture-mode';

/**
 * The checks quality.yml used to run as bespoke steps, each now a ci-pr gate.
 * Commands go through the package.json script so the command line has exactly
 * one definition (pre-push and humans run the same scripts).
 */
export const COMMAND_GATES = Object.freeze({
  'check-typecheck': 'pnpm run typecheck',
  'check-type-coverage': 'pnpm run check:type-coverage',
  'check-layout-tests': 'pnpm run test:layout',
});

const OUTPUT_TAIL_LINES = 40;

/**
 * Decide what to spawn. Pure.
 *
 * @param {{command?: string, argv?: readonly string[], env?: Record<string, string|undefined>}} opts
 * @returns {{ok: true, mode: 'tool', command: string}
 *          | {ok: true, mode: 'fixture', file: string}
 *          | {ok: false, error: string}}
 */
export function resolveInvocation({ command, argv = [], env = {} }) {
  if (argv.includes(FIXTURE_FLAG)) {
    const file = env.FIXTURE_FILE;
    if (!file) return { ok: false, error: `${FIXTURE_FLAG} requires FIXTURE_FILE to be set` };
    return { ok: true, mode: 'fixture', file };
  }
  if (typeof command !== 'string' || command.trim() === '') {
    return { ok: false, error: 'no command configured for this gate' };
  }
  return { ok: true, mode: 'tool', command };
}

function tail(text, n) {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-n).join('\n');
}

/**
 * Run the gate. Returns the process exit code; the caller exits with it.
 *
 * @param {object} opts
 * @param {string} opts.id                      registry id (used in messages + rule name)
 * @param {string} [opts.command]               shell command for the real tool
 * @param {readonly string[]} [opts.argv]       defaults to process.argv.slice(2)
 * @param {NodeJS.ProcessEnv} [opts.env]        defaults to process.env
 * @param {string} [opts.cwd]                   defaults to the repo root
 * @returns {0|1|2}
 */
export function runCommandGate({
  id,
  command,
  argv = process.argv.slice(2),
  env = process.env,
  cwd = ROOT,
}) {
  const inv = resolveInvocation({ command, argv, env });
  if (!inv.ok) {
    process.stderr.write(`✗ ${id}: ${inv.error}\n`);
    return 2;
  }

  const jsonMode = hasJsonFlag(argv);
  const label = inv.mode === 'tool' ? inv.command : `node ${inv.file}`;
  const options = {
    cwd,
    env,
    stdio: jsonMode ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  };
  // The tool command is a fixed string from COMMAND_GATES, run through the
  // shell so `pnpm` resolves on Windows (pnpm.cmd) as well as on the runner.
  const result =
    inv.mode === 'tool'
      ? spawnSync(inv.command, { ...options, shell: true })
      : spawnSync(process.execPath, [inv.file], options);

  const exitCode = typeof result.status === 'number' ? result.status : null;
  const passed = exitCode === 0 && !result.error;
  const cause = result.error
    ? result.error.message
    : exitCode === null
      ? `killed by ${result.signal ?? 'signal'}`
      : `exit ${exitCode}`;

  if (jsonMode) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (output) process.stderr.write(output);
    emitResult(
      {
        violations: passed
          ? []
          : [
              {
                file: '*',
                line: null,
                rule: `${id}-failed`,
                severity: 'error',
                message: `\`${label}\` failed (${cause})`,
                outputTail: tail(output, OUTPUT_TAIL_LINES),
              },
            ],
        summary: { command: label, exitCode },
        ok: passed,
      },
      true,
    );
  } else if (!passed) {
    process.stderr.write(`✗ ${id}: \`${label}\` failed (${cause})\n`);
  }

  return passed ? 0 : 1;
}
