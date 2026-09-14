import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-link-integrity.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'check-link-integrity-'));
  cleanup.push(dir);
  return dir;
}

// Runs the route-links sub-check in fixture mode against a scratch source
// file, so the test never depends on (or mutates) real src/app content —
// only the real src/app/routes.tsx, which is what's under test here.
function runRouteLinks(source) {
  const dir = tmp();
  const fx = join(dir, 'Fixture.tsx');
  writeFileSync(fx, source, 'utf8');
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--route-links-only', '--fixture-mode', '--json'], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: fx },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, json: JSON.parse(stdout) };
}

describe('check-link-integrity route-links (ops#176)', () => {
  it('allows a real nested route composed from routes.tsx children (no manual allowlist entry needed)', () => {
    const { code, json } = runRouteLinks('<Link to="/ops/tasks">Tasks</Link>;');
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });

  it('flags a route that no longer exists in routes.tsx (stale legacy path)', () => {
    const { code, json } = runRouteLinks('<Link to="/ops/sessions">Sessions</Link>;');
    expect(code).toBe(1);
    expect(json.violations).toEqual([
      expect.objectContaining({
        rule: 'route-link-unknown',
        message: expect.stringContaining('/ops/sessions'),
      }),
    ]);
  });

  it('allows a dynamic-param route via prefix match', () => {
    const { code, json } = runRouteLinks('<Link to="/ops/clients/acme">Acme</Link>;');
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });

  it('respects the route-ok escape hatch', () => {
    const { code, json } = runRouteLinks(
      '<Link to="/ops/sessions">Sessions</Link>; // route-ok: intentionally testing the hatch',
    );
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });
});
