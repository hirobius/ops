import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isBinaryUnavailable } from '../check-editorconfig.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-editorconfig.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'check-editorconfig-'));
  cleanup.push(dir);
  return dir;
}

// Writes a fake "editorconfig-checker" as a node script and points the guard
// at it via the CHECK_EDITORCONFIG_BIN/ARGS test overrides — never touches
// the real network-dependent binary.
function fakeBin(body) {
  const dir = tmp();
  const fake = join(dir, 'fake-ec.mjs');
  writeFileSync(fake, body);
  chmodSync(fake, 0o755);
  return fake;
}

function run(fakePath, extraEnv = {}) {
  const result = spawnSync('node', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHECK_EDITORCONFIG_BIN: 'node',
      CHECK_EDITORCONFIG_ARGS: fakePath,
      ...extraEnv,
    },
  });
  return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('isBinaryUnavailable', () => {
  it('recognizes the download-failure marker', () => {
    expect(isBinaryUnavailable('Failed to download binary:\nsome network error')).toBe(true);
  });

  it('ignores unrelated output', () => {
    expect(isBinaryUnavailable('src/App.tsx:12: trailing whitespace')).toBe(false);
    expect(isBinaryUnavailable('')).toBe(false);
    expect(isBinaryUnavailable(undefined)).toBe(false);
  });
});

describe('check-editorconfig guard', () => {
  it('passes through a clean run', () => {
    const fake = fakeBin('process.exit(0);');
    const { code } = run(fake);
    expect(code).toBe(0);
  });

  it('forwards a real violation as a failure', () => {
    const fake = fakeBin("console.log('src/App.tsx:12: trailing whitespace'); process.exit(1);");
    const { code, stdout } = run(fake);
    expect(code).toBe(1);
    expect(stdout).toContain('trailing whitespace');
  });

  it('skips with a warning (exit 0) when the binary download fails', () => {
    const fake = fakeBin(
      "console.error('Failed to download binary:\\nGET https://... 403'); process.exit(1);",
    );
    const { code, stderr } = run(fake);
    expect(code).toBe(0);
    expect(stderr).toContain('editorconfig-checker binary unavailable');
  });

  it('skips with a warning (exit 0) when the underlying tool hangs past the timeout', () => {
    const fake = fakeBin('setTimeout(() => {}, 60_000);');
    const { code, stderr } = run(fake, { CHECK_EDITORCONFIG_TIMEOUT_MS: '200' });
    expect(code).toBe(0);
    expect(stderr).toContain('editorconfig-checker binary unavailable');
  }, 10_000);
});
