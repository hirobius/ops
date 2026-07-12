import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'audit-orphan-modules.mjs');
const REGISTRY = join(ROOT, 'docs', 'guardrails', 'registry.json');
const PKG = join(ROOT, 'package.json');
const VIOLATING_FIXTURE = join(ROOT, 'fixtures', 'audit-orphan-modules', 'violating.example.json');
const PASSING_FIXTURE = join(ROOT, 'fixtures', 'audit-orphan-modules', 'passing.example.json');

// Run the gate in fixture mode against a synthetic knip --reporter json
// payload. Never touches the real knip binary. Returns { code, json }.
function runFixture(fixturePath) {
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--fixture-mode', '--json'], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: fixturePath, HDS_FIXTURE_MODE: '1' },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, json: JSON.parse(stdout) };
}

describe('audit-orphan-modules', () => {
  it('is registered in the guardrail registry under the pnpm-meta channel', () => {
    const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'));
    const gate = registry.gates.find((g) => g.id === 'audit-orphan-modules');
    expect(gate).toBeDefined();
    expect(gate.gateScript).toBe('scripts/audit-orphan-modules.mjs');
    expect(gate.severity).toBe('warn');
    expect(gate.firingChannel).toBe('pnpm-meta');
  });

  it('is wired as a pnpm script', () => {
    const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
    expect(pkg.scripts['audit:orphan-modules']).toBe('node scripts/audit-orphan-modules.mjs');
  });

  it('reports the known-orphan case as a warn violation and never blocks', () => {
    const { code, json } = runFixture(VIOLATING_FIXTURE);
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.violations).toHaveLength(1);
    expect(json.violations[0].rule).toBe('ORPHAN_MODULE');
    expect(json.violations[0].severity).toBe('warn');
    expect(json.violations[0].file).toBe('src/lib/unused-example-helper.ts');
    expect(json.summary.totalOrphans).toBe(1);
  });

  it('reports no violations when knip finds no unused files', () => {
    const { code, json } = runFixture(PASSING_FIXTURE);
    expect(code).toBe(0);
    expect(json.ok).toBe(true);
    expect(json.violations).toHaveLength(0);
    expect(json.summary.totalOrphans).toBe(0);
  });
});
