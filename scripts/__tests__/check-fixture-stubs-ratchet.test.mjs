import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-fixture-stubs-ratchet.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmpBaselinePath() {
  const dir = mkdtempSync(join(tmpdir(), 'fixture-stubs-ratchet-'));
  cleanup.push(dir);
  return join(dir, 'baseline.json');
}

function run(baselineFile) {
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      env: { ...process.env, CHECK_FIXTURE_STUBS_BASELINE_FILE: baselineFile },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, json: JSON.parse(stdout) };
}

function readBaseline(baselineFile) {
  return JSON.parse(readFileSync(baselineFile, 'utf8'));
}

// Each run() shells out to validate-fixture-proof-of-firing.mjs against the
// live repo (~2s); tests that call it twice need headroom past the 5s default,
// especially under parallel CPU contention in the full suite.
const SUBPROCESS_TEST_TIMEOUT = 20_000;

describe('check-fixture-stubs-ratchet', () => {
  it(
    'bootstraps a fresh baseline to the current count',
    () => {
      const baselineFile = tmpBaselinePath();
      const { code, json } = run(baselineFile);
      expect(code).toBe(0);
      expect(json.ok).toBe(true);
      expect(existsSync(baselineFile)).toBe(true);
      expect(readBaseline(baselineFile).count).toBe(json.summary.current);
    },
    SUBPROCESS_TEST_TIMEOUT,
  );

  it(
    'holds without writing when the count is unchanged',
    () => {
      const baselineFile = tmpBaselinePath();
      run(baselineFile); // bootstrap
      const before = readBaseline(baselineFile);

      const { code, json } = run(baselineFile);
      const after = readBaseline(baselineFile);

      expect(code).toBe(0);
      expect(json.ok).toBe(true);
      expect(json.summary.delta).toBe(0);
      expect(after).toEqual(before); // no write: updatedAt/sha untouched
    },
    SUBPROCESS_TEST_TIMEOUT,
  );

  it(
    'advances the watermark and writes when the count decreases',
    () => {
      const baselineFile = tmpBaselinePath();
      run(baselineFile); // bootstrap at the real current count
      const bootstrapped = readBaseline(baselineFile);

      // Simulate a prior, higher stored count so this run looks like a decrease.
      writeFileSync(
        baselineFile,
        JSON.stringify({ ...bootstrapped, count: bootstrapped.count + 1 }, null, 2) + '\n',
        'utf8',
      );
      const before = readBaseline(baselineFile);

      const { code, json } = run(baselineFile);
      const after = readBaseline(baselineFile);

      expect(code).toBe(0);
      expect(json.ok).toBe(true);
      expect(json.summary.delta).toBe(-1);
      expect(after.count).toBe(before.count - 1);
      expect(after.updatedAt).not.toBe(before.updatedAt);
    },
    SUBPROCESS_TEST_TIMEOUT,
  );

  it(
    'fails and does not write when the count increases',
    () => {
      const baselineFile = tmpBaselinePath();
      run(baselineFile); // bootstrap at the real current count
      const bootstrapped = readBaseline(baselineFile);

      // Simulate a prior, lower stored count so this run looks like a regression.
      writeFileSync(
        baselineFile,
        JSON.stringify({ ...bootstrapped, count: bootstrapped.count - 1 }, null, 2) + '\n',
        'utf8',
      );
      const before = readBaseline(baselineFile);

      const { code, json } = run(baselineFile);
      const after = readBaseline(baselineFile);

      expect(code).toBe(1);
      expect(json.ok).toBe(false);
      expect(json.violations[0].rule).toBe('fixture-stubs-ratchet-regression');
      expect(after).toEqual(before); // no write on regression
    },
    SUBPROCESS_TEST_TIMEOUT,
  );

  it(
    'running twice on a clean tree leaves the baseline byte-identical',
    () => {
      const baselineFile = tmpBaselinePath();
      run(baselineFile);
      const first = readFileSync(baselineFile, 'utf8');
      run(baselineFile);
      const second = readFileSync(baselineFile, 'utf8');
      expect(second).toBe(first);
    },
    SUBPROCESS_TEST_TIMEOUT,
  );
});
