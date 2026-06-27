import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadRegistry,
  selectGates,
  runGateCaptured,
  REGISTRY_PATH,
} from '../lib/guardrail-core.mjs';

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'guardrail-core-'));
  cleanup.push(dir);
  return dir;
}

// A small synthetic registry for the pure selectGates tests.
const FIXTURE_REGISTRY = {
  gates: [
    { id: 'a', firingChannel: 'pre-commit', scope: 'full-tree' },
    { id: 'b', firingChannel: 'pre-commit', glob: 'src/**/*.tsx' },
    { id: 'c', firingChannel: 'pre-commit' }, // no scope/glob → safe full-tree
    { id: 'd', firingChannel: 'ci-pr', glob: 'docs/**/*.md' },
  ],
};

describe('loadRegistry', () => {
  it('loads + parses the real registry', () => {
    const r = loadRegistry(REGISTRY_PATH);
    expect(r.ok).toBe(true);
    expect(Array.isArray(r.registry.gates)).toBe(true);
    expect(r.registry.gates.length).toBeGreaterThan(0);
  });

  it('returns not-found (no throw, no exit) for a missing path', () => {
    const r = loadRegistry('/does/not/exist/registry.json');
    expect(r.ok).toBe(false);
    expect(r.error.kind).toBe('not-found');
  });

  it('returns parse error for malformed JSON', () => {
    const dir = tmp();
    const bad = join(dir, 'registry.json');
    writeFileSync(bad, '{ not valid json ');
    const r = loadRegistry(bad);
    expect(r.ok).toBe(false);
    expect(r.error.kind).toBe('parse');
    expect(typeof r.error.message).toBe('string');
  });
});

describe('selectGates', () => {
  it('selects a single gate by id', () => {
    const r = selectGates({ registry: FIXTURE_REGISTRY, gate: 'b' });
    expect(r.ok).toBe(true);
    expect(r.gates.map((g) => g.id)).toEqual(['b']);
    expect(r.skippedByScope).toEqual([]);
  });

  it('reports gate-not-found for an unknown id', () => {
    const r = selectGates({ registry: FIXTURE_REGISTRY, gate: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('gate-not-found');
    expect(r.gate).toBe('nope');
  });

  it('filters by channel in declaration order', () => {
    const r = selectGates({ registry: FIXTURE_REGISTRY, channel: 'pre-commit' });
    expect(r.ok).toBe(true);
    expect(r.gates.map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns no-gates-for-channel (skippedByScope empty) for an empty channel', () => {
    const r = selectGates({ registry: FIXTURE_REGISTRY, channel: 'pre-push' });
    expect(r.ok).toBe(true);
    expect(r.gates).toEqual([]);
    expect(r.emptyReason).toBe('no-gates-for-channel');
    expect(r.skippedByScope).toEqual([]);
  });

  it('keeps scope/glob matches and records skipped glob-only gates', () => {
    // Only b has a glob; it matches a .tsx change. a (full-tree) + c (no glob)
    // always run; b runs because the change matches; nothing is skipped.
    const r = selectGates({
      registry: FIXTURE_REGISTRY,
      channel: 'pre-commit',
      changedFiles: ['src/app/Foo.tsx'],
    });
    expect(r.gates.map((g) => g.id)).toEqual(['a', 'b', 'c']);
    expect(r.skippedByScope).toEqual([]);
  });

  it('skips a glob gate whose pattern matches nothing', () => {
    // b's glob (src/**/*.tsx) does not match a docs change → b skipped;
    // a + c still run (full-tree / no-glob).
    const r = selectGates({
      registry: FIXTURE_REGISTRY,
      channel: 'pre-commit',
      changedFiles: ['docs/readme.md'],
    });
    expect(r.gates.map((g) => g.id)).toEqual(['a', 'c']);
    expect(r.skippedByScope).toEqual(['b']);
  });

  it('returns scope-filtered-all when scope empties the list', () => {
    // ci-pr has only d (glob docs/**/*.md); a .ts change matches nothing.
    const r = selectGates({
      registry: FIXTURE_REGISTRY,
      channel: 'ci-pr',
      changedFiles: ['src/app/Foo.ts'],
    });
    expect(r.ok).toBe(true);
    expect(r.gates).toEqual([]);
    expect(r.emptyReason).toBe('scope-filtered-all');
    expect(r.skippedByScope).toEqual(['d']);
  });
});

describe('runGateCaptured', () => {
  it('captures stdout, exit code, and passes extraArgs through', () => {
    const dir = tmp();
    const script = join(dir, 'gate.mjs');
    // Echoes its argv as JSON and exits 3.
    writeFileSync(
      script,
      'process.stdout.write(JSON.stringify({ argv: process.argv.slice(2) }));\nprocess.exit(3);\n',
    );
    const r = runGateCaptured(script, { extraArgs: ['--json'] });
    expect(r.exitCode).toBe(3);
    expect(r.timedOut).toBe(false);
    expect(r.spawnError).toBe(null);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(r.stdout)).toEqual({ argv: ['--json'] });
  });

  it('flags timedOut when the gate exceeds timeoutMs', () => {
    const dir = tmp();
    const script = join(dir, 'slow.mjs');
    // Block far longer than the timeout via a busy spin (no async needed).
    writeFileSync(
      script,
      'const end = Date.now() + 5000; while (Date.now() < end) {}\n',
    );
    const r = runGateCaptured(script, { timeoutMs: 150 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBe(null);
  });
});
