import { describe, it, expect, afterEach } from 'vitest';
import {
  writeFileSync,
  readFileSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { toPosixPath } from '../check-dom-node-budgets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-dom-node-budgets.mjs');
const BASELINE = join(ROOT, 'docs', 'guardrails', 'baselines', 'check-dom-node-budgets.json');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'dom-budgets-'));
  cleanup.push(dir);
  return dir;
}

function run(args, extraEnv = {}) {
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, ...args], {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, json: JSON.parse(stdout) };
}

function runFixture(overBudgetCount) {
  const dir = tmp();
  const fx = join(dir, 'case.json');
  writeFileSync(fx, JSON.stringify({ overBudgetCount }));
  return run(['--fixture-mode', '--json'], { FIXTURE_FILE: fx, HDS_FIXTURE_MODE: '1' });
}

describe('check-dom-node-budgets', () => {
  it('ships a committed per-file budget baseline', () => {
    expect(existsSync(BASELINE)).toBe(true);
    const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
    expect(typeof b.budgets).toBe('object');
    expect(Object.keys(b.budgets).length).toBeGreaterThan(0);
  });

  it('passes on the live tree (every file within its locked budget)', () => {
    const { code, json } = run(['--json']);
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.violations).toHaveLength(0);
  });

  it('passes in fixture mode when nothing is over budget', () => {
    const { code, json } = runFixture(0);
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
  });

  it('fails in fixture mode when files exceed budget', () => {
    const { code, json } = runFixture(3);
    expect(code).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.violations[0].rule).toBe('dom-node-budget');
    expect(json.violations[0].severity).toBe('error');
  });

  // Windows regression. `relative()` yields `src\app\…` there, which matched no
  // key in the committed baseline: every file looked brand-new, so a plain run
  // rewrote the whole baseline with backslash keys and raised every budget.
  // That is why `--update` used to be WSL-only (merge-plan F4b).
  describe('path keys are POSIX on every platform', () => {
    it('keys the committed baseline with forward slashes only', () => {
      const { budgets } = JSON.parse(readFileSync(BASELINE, 'utf8'));
      const backslashed = Object.keys(budgets).filter((key) => key.includes('\\'));
      expect(backslashed).toEqual([]);
    });

    // The assertion that can actually fail on CI. A whole-gate run cannot catch
    // this on Linux, where `relative()` already returns forward slashes — the
    // separator handling would have to be exercised on Windows to break. So the
    // conversion is tested directly, on a literal Windows-shaped path, and a
    // revert to `.split(sep)` goes red on every platform.
    it('converts a native separator to POSIX whatever the host OS is', () => {
      expect(toPosixPath('src\\app\\pages\\HomePage.tsx')).toBe('src/app/pages/HomePage.tsx');
      expect(toPosixPath('src/app/pages/HomePage.tsx')).toBe('src/app/pages/HomePage.tsx');
      expect(toPosixPath('HomePage.tsx')).toBe('HomePage.tsx');
      expect(toPosixPath('')).toBe('');
    });

    it('never writes a platform-native separator, and settles after one run', () => {
      // Writes go to a disposable copy, never the tracked baseline: this runs
      // under `pnpm test` (and `--watch`, on every save), and a Ctrl-C or a
      // killed worker between the two multi-second AST scans would otherwise
      // leave the real file rewritten in the working tree, to be swept into the
      // next unrelated commit. Same reason check-fixture-stubs-ratchet took an
      // env override. Real writes, real repo counts, isolated destination.
      const tracked = readFileSync(BASELINE, 'utf8');
      const scratch = join(tmp(), 'check-dom-node-budgets.json');
      copyFileSync(BASELINE, scratch);

      // No --json: this is the mode that persists a tightened/extended baseline.
      // Twice, because the second run is the one that proves it settles — an
      // unsorted comparison used to rewrite updatedAt/sha on every single run.
      const persist = () => {
        try {
          execFileSync('node', [SCRIPT], {
            cwd: ROOT,
            encoding: 'utf8',
            env: { ...process.env, CHECK_DOM_NODE_BUDGETS_BASELINE_FILE: scratch },
          });
        } catch {
          // Over budget here is someone else's failure; key shape is the assertion.
        }
        return readFileSync(scratch, 'utf8');
      };
      const first = persist();
      const second = persist();

      const written = Object.keys(JSON.parse(first).budgets);
      expect(written.filter((key) => key.includes('\\'))).toEqual([]);
      expect(written.length).toBeGreaterThan(0);
      expect(second).toBe(first);
      // And the tracked file is exactly as it was — no cleanup step required.
      expect(readFileSync(BASELINE, 'utf8')).toBe(tracked);
    });
  });
});
