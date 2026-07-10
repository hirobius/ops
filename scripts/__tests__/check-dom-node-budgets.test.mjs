import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

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
});
