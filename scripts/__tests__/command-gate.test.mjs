import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveInvocation, FIXTURE_FLAG } from '../lib/command-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = join(__dirname, '..', 'lib', 'command-gate.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'command-gate-'));
  cleanup.push(dir);
  return dir;
}

// A stand-in "tool": a node script whose body decides output + exit code.
function fakeTool(body) {
  const file = join(tmp(), 'fake-tool.mjs');
  writeFileSync(file, body);
  return file;
}

// Shell command that runs a fake tool under the current node (quoted: the
// node path and the temp dir can both contain spaces on Windows).
function nodeCommand(file) {
  return `"${process.execPath}" "${file}"`;
}

// Drives runCommandGate in a real subprocess, exactly as a gate script does,
// so stdio inheritance and the exit code are observed end-to-end.
function runGate({ command, args = [], env = {} }) {
  const driver = join(tmp(), 'driver.mjs');
  writeFileSync(
    driver,
    `import { runCommandGate } from ${JSON.stringify(pathToFileURL(LIB).href)};\n` +
      `process.exit(runCommandGate({ id: 'fake-gate', command: ${JSON.stringify(command)} }));\n`,
  );
  const r = spawnSync(process.execPath, [driver, ...args], {
    encoding: 'utf8',
    env: { ...process.env, FIXTURE_FILE: '', ...env },
  });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('resolveInvocation', () => {
  it('runs the real tool command by default', () => {
    const inv = resolveInvocation({ command: 'pnpm run typecheck', argv: [], env: {} });
    expect(inv).toEqual({ ok: true, mode: 'tool', command: 'pnpm run typecheck' });
  });

  it('switches to the fixture only when --fixture-mode AND FIXTURE_FILE are both present', () => {
    const inv = resolveInvocation({
      command: 'pnpm run typecheck',
      argv: [FIXTURE_FLAG],
      env: { FIXTURE_FILE: '/repo/fixtures/x/violating.example.mjs' },
    });
    expect(inv).toEqual({
      ok: true,
      mode: 'fixture',
      file: '/repo/fixtures/x/violating.example.mjs',
    });
  });

  it('never swaps the real run for a fixture on a leaked FIXTURE_FILE alone', () => {
    // run-gates never passes --fixture-mode, so an env var that happens to be
    // set in CI must not silently replace tsc/Playwright with a stub script.
    const inv = resolveInvocation({
      command: 'pnpm run typecheck',
      argv: [],
      env: { FIXTURE_FILE: '/repo/fixtures/x/passing.example.mjs', HDS_FIXTURE_MODE: '1' },
    });
    expect(inv.mode).toBe('tool');
  });

  it('is an invocation error to ask for fixture mode without a fixture file', () => {
    const inv = resolveInvocation({ command: 'pnpm run typecheck', argv: [FIXTURE_FLAG], env: {} });
    expect(inv.ok).toBe(false);
    expect(inv.error).toMatch(/FIXTURE_FILE/);
  });

  it('is an invocation error when the gate has no command', () => {
    const inv = resolveInvocation({ command: undefined, argv: [], env: {} });
    expect(inv.ok).toBe(false);
    expect(inv.error).toMatch(/no command/);
  });
});

describe('runCommandGate', () => {
  it('passes (exit 0) when the tool passes', () => {
    const tool = fakeTool("console.log('all good'); process.exit(0);");
    const { code, stdout } = runGate({ command: nodeCommand(tool) });
    expect(code).toBe(0);
    expect(stdout).toContain('all good');
  });

  it('fails (exit 1) and forwards output when the tool fails with any non-zero code', () => {
    // tsc reports type errors with exit 2 — that must still read as a gate
    // failure, normalized to 1 for the registry contract.
    const tool = fakeTool("console.log('src/a.ts(1,7): error TS2322'); process.exit(2);");
    const { code, stdout, stderr } = runGate({ command: nodeCommand(tool) });
    expect(code).toBe(1);
    expect(stdout).toContain('error TS2322');
    expect(stderr).toContain('fake-gate');
  });

  it('fails when the tool cannot be found at all', () => {
    const { code } = runGate({ command: 'definitely-not-a-real-binary-ops241 --flag' });
    expect(code).toBe(1);
  });

  it('exits 2 on an invocation error rather than passing', () => {
    const { code, stderr } = runGate({ command: 'pnpm run typecheck', args: [FIXTURE_FLAG] });
    expect(code).toBe(2);
    expect(stderr).toMatch(/FIXTURE_FILE/);
  });

  it('runs the fixture file in fixture mode instead of the tool', () => {
    const fixture = fakeTool("console.log('fixture ran'); process.exit(1);");
    const { code, stdout } = runGate({
      command: 'definitely-not-a-real-binary-ops241',
      args: [FIXTURE_FLAG],
      env: { FIXTURE_FILE: fixture },
    });
    expect(code).toBe(1);
    expect(stdout).toContain('fixture ran');
  });

  describe('--json', () => {
    it('emits only the canonical JSON on stdout for a pass', () => {
      const tool = fakeTool("console.log('noise that must not reach stdout'); process.exit(0);");
      const { code, stdout, stderr } = runGate({ command: nodeCommand(tool), args: ['--json'] });
      expect(code).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.violations).toEqual([]);
      expect(stderr).toContain('noise that must not reach stdout');
    });

    it('reports a failing tool as one error violation carrying the output tail', () => {
      const tool = fakeTool("console.error('Error: 3 layout collisions'); process.exit(1);");
      const { code, stdout } = runGate({ command: nodeCommand(tool), args: ['--json'] });
      expect(code).toBe(1);
      const parsed = JSON.parse(stdout);
      expect(parsed.ok).toBe(false);
      expect(parsed.violations).toHaveLength(1);
      expect(parsed.violations[0]).toMatchObject({
        file: '*',
        line: null,
        rule: 'fake-gate-failed',
        severity: 'error',
      });
      expect(parsed.violations[0].outputTail).toContain('3 layout collisions');
    });
  });
});
