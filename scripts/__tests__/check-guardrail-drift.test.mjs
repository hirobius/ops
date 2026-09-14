import { describe, it, expect, afterEach } from 'vitest';
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  appendFileSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-guardrail-drift.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'guardrail-drift-'));
  cleanup.push(dir);
  return dir;
}

// Runs the gate against a scratch manifest via fixture-mode plumbing (the same
// FIXTURE_FILE / HDS_FIXTURE_MODE contract validate-fixture-proof-of-firing
// uses), so tests never touch the real docs/guardrails/shared-manifest.json.
function run(manifestPath, extraArgs = []) {
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--fixture-mode', ...extraArgs], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: manifestPath, HDS_FIXTURE_MODE: '1' },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = (err.stdout ?? '') + (err.stderr ?? '');
  }
  return { code, stdout };
}

function writeManifest(dir, files) {
  const path = join(dir, 'manifest.json');
  writeFileSync(path, JSON.stringify({ canonicalRepo: 'hirobius/ops', files }));
  return path;
}

describe('check-guardrail-drift', () => {
  it('exits 2 when the manifest is missing', () => {
    const dir = tmp();
    const { code } = run(join(dir, 'does-not-exist.json'));
    expect(code).toBe(2);
  });

  it('--write pins the current hash, then verify exits 0', () => {
    const dir = tmp();
    const target = join(dir, 'target.txt');
    writeFileSync(target, 'stable content\n');
    const manifest = writeManifest(dir, { [target]: '' });

    const written = run(manifest, ['--write']);
    expect(written.code).toBe(0);

    const verified = run(manifest);
    expect(verified.code).toBe(0);
    expect(JSON.parse(readFileSync(manifest, 'utf8')).files[target]).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
  });

  it('flags drift once a pinned file changes', () => {
    const dir = tmp();
    const target = join(dir, 'target.txt');
    writeFileSync(target, 'stable content\n');
    const manifest = writeManifest(dir, { [target]: '' });
    run(manifest, ['--write']);

    appendFileSync(target, 'a rogue byte\n');
    const { code, stdout } = run(manifest);
    expect(code).toBe(1);
    expect(stdout + '').toMatch(/\[drift\]/);
  });

  it('--json reports structured findings on drift', () => {
    const dir = tmp();
    const target = join(dir, 'target.txt');
    writeFileSync(target, 'stable content\n');
    const manifest = writeManifest(dir, { [target]: '' });
    run(manifest, ['--write']);
    appendFileSync(target, 'a rogue byte\n');

    const { code, stdout } = run(manifest, ['--json']);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].kind).toBe('drift');
  });

  it('reports a deleted pinned file as missing', () => {
    const dir = tmp();
    const target = join(dir, 'target.txt');
    writeFileSync(target, 'stable content\n');
    const manifest = writeManifest(dir, { [target]: '' });
    run(manifest, ['--write']);

    unlinkSync(target);
    const { code, stdout } = run(manifest);
    expect(code).toBe(1);
    expect(stdout + '').toMatch(/\[missing\]/);
  });

  it('the committed manifest matches the real shared scripts (no drift in this repo)', () => {
    let code = 0;
    let stdout = '';
    try {
      stdout = execFileSync('node', [SCRIPT, '--json'], { cwd: ROOT, encoding: 'utf8' });
    } catch (err) {
      code = err.status ?? 1;
      stdout = err.stdout ?? '';
    }
    expect(code).toBe(0);
    expect(JSON.parse(stdout).ok).toBe(true);
  });
});
