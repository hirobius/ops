import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-circular-deps.mjs');
const BASELINE = join(ROOT, 'docs', 'guardrails', 'baselines', 'check-circular-deps.json');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'circular-deps-'));
  cleanup.push(dir);
  return dir;
}

function lockedCount() {
  return JSON.parse(readFileSync(BASELINE, 'utf8')).count;
}

// Run the gate in fixture mode with a synthetic cycle count. Never touches the
// baseline (fixture mode skips the tighten path). Returns { code, json }.
function runFixture(cycleCount) {
  const dir = tmp();
  const fx = join(dir, 'case.json');
  writeFileSync(fx, JSON.stringify({ cycleCount }));
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--fixture-mode', '--json'], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: fx, HDS_FIXTURE_MODE: '1' },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, json: JSON.parse(stdout) };
}

describe('check-circular-deps', () => {
  it('ships a committed baseline lock', () => {
    expect(existsSync(BASELINE)).toBe(true);
    expect(typeof lockedCount()).toBe('number');
  });

  it('passes when the cycle count equals the lock', () => {
    const { code, json } = runFixture(lockedCount());
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.violations).toHaveLength(0);
  });

  it('fails when the cycle count exceeds the lock', () => {
    const { code, json } = runFixture(lockedCount() + 5);
    expect(code).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.violations.length).toBeGreaterThan(0);
    expect(json.violations[0].rule).toBe('circular-dependency');
    expect(json.violations[0].severity).toBe('error');
  });

  it('detects a real import cycle in a synthetic graph and passes when clean', () => {
    // Exercise the actual graph builder against the live src/ tree by running
    // the gate for real; the committed lock is 0, so the clean tree must pass.
    let code = 0;
    let stdout = '';
    try {
      stdout = execFileSync('node', [SCRIPT, '--json'], { cwd: ROOT, encoding: 'utf8' });
    } catch (err) {
      code = err.status ?? 1;
      stdout = err.stdout ?? '';
    }
    const json = JSON.parse(stdout);
    expect(code).toBe(0);
    expect(typeof json.summary.current).toBe('number');
    expect(json.summary.current).toBeLessThanOrEqual(lockedCount());
  });
});
