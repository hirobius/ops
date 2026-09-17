import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadRegistry,
  selectGates,
  runGateCaptured,
  gateOutcome,
  runGatesSerial,
  summarizeRun,
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

// ── Severity (ops#306) ────────────────────────────────────────────────────────
// A failing `error` gate blocks the run; a failing `warn` gate reports and
// passes. Severity used to be decorative — run-gates failed on any non-zero.

describe('gateOutcome', () => {
  it('passes a zero exit whatever the severity', () => {
    expect(gateOutcome({ id: 'e', severity: 'error' }, 0)).toBe('pass');
    expect(gateOutcome({ id: 'w', severity: 'warn' }, 0)).toBe('pass');
  });

  it('fails a non-zero error-severity gate', () => {
    expect(gateOutcome({ id: 'e', severity: 'error' }, 1)).toBe('fail');
  });

  it('only warns for a non-zero warn- or info-severity gate', () => {
    expect(gateOutcome({ id: 'w', severity: 'warn' }, 1)).toBe('warn');
    expect(gateOutcome({ id: 'w', severity: 'warn' }, 2)).toBe('warn');
    expect(gateOutcome({ id: 'i', severity: 'info' }, 1)).toBe('warn');
  });

  it('fails closed when severity is missing or unrecognised', () => {
    // A gate with no deliberate severity keeps the old blocking behaviour
    // rather than silently becoming advisory.
    expect(gateOutcome({ id: 'x' }, 1)).toBe('fail');
    expect(gateOutcome({ id: 'x', severity: 'Warn' }, 1)).toBe('fail');
  });
});

describe('runGatesSerial', () => {
  const GATES = [
    { id: 'warn-red', severity: 'warn' },
    { id: 'ok', severity: 'error' },
    { id: 'error-red', severity: 'error' },
    { id: 'after', severity: 'error' },
  ];
  const EXITS = { 'warn-red': 1, ok: 0, 'error-red': 1, after: 0 };

  function fakeRunner() {
    const ran = [];
    return {
      ran,
      runGate: (gate) => {
        ran.push(gate.id);
        return EXITS[gate.id];
      },
    };
  }

  it('fail-fast runs past a failing warn gate and stops at the first failing error gate', () => {
    const { ran, runGate } = fakeRunner();
    const r = runGatesSerial({ gates: GATES, runGate, failFast: true });
    expect(ran).toEqual(['warn-red', 'ok', 'error-red']);
    expect(r.stoppedAt).toBe('error-red');
    expect(r.results).toEqual([
      { id: 'warn-red', severity: 'warn', exitCode: 1, outcome: 'warn' },
      { id: 'ok', severity: 'error', exitCode: 0, outcome: 'pass' },
      { id: 'error-red', severity: 'error', exitCode: 1, outcome: 'fail' },
    ]);
  });

  it('without fail-fast runs every gate even after an error gate fails', () => {
    const { ran, runGate } = fakeRunner();
    const r = runGatesSerial({ gates: GATES, runGate, failFast: false });
    expect(ran).toEqual(['warn-red', 'ok', 'error-red', 'after']);
    expect(r.stoppedAt).toBe(null);
    expect(r.results.map((x) => x.outcome)).toEqual(['warn', 'pass', 'fail', 'pass']);
  });
});

describe('registry severity curation (ops#306)', () => {
  // Every gate on a channel that run-gates runs as BLOCKING — `.husky/pre-commit`
  // (--channel pre-commit) and `.github/workflows/quality.yml` (--channel ci-pr)
  // — with the severity decided for it. Since ops#306 severity decides whether
  // a gate blocks, so the lock is exhaustive per channel: flipping any row to
  // `warn`, adding a gate to one of these channels, or moving a gate off one
  // all fail here until someone decides on purpose. Changing a row is a
  // standards decision — update the curation record in
  // docs/guardrails/SCHEMA.md alongside this table.
  const DECIDED = {
    'pre-commit': {
      // error — a finding is a defect in the change; blocks the commit.
      'check-security-baseline': 'error',
      'check-hardcoded-colors': 'error',
      'check-page-shell': 'error',
      'check-unresponsive-grids': 'error',
      'check-validator-wiring': 'error',
      'check-licenses': 'error',
      'check-secrets': 'error',
      'check-steering-budget': 'error',
      'validate-fixture-proof-of-firing': 'error',
      'validate-orchestration': 'error',
      'check-schema-drift': 'error',
      // warn — reporting / bookkeeping, the three "unsure" gates (each still
      // blocks PR CI: see SCHEMA.md), and a gate that always exits 0.
      'generate-strength-report': 'warn',
      'audit-batch-deliverables': 'warn',
      'audit-claims': 'warn',
      'audit-exceptions': 'warn',
      'check-route-coverage': 'warn',
      'check-og-meta': 'warn',
      'check-exemptions': 'warn',
      'check-branch-ancestry': 'warn',
    },
    'ci-pr': {
      'check-fixture-stubs-ratchet': 'error',
      'check-guardrail-drift': 'error',
      'audit-gate-purity': 'warn',
      'audit-gates-supportjson': 'warn',
    },
  };

  it.each(Object.keys(DECIDED))(
    'every %s gate carries its decided severity, and no undecided gate is on the channel',
    (channel) => {
      const { registry } = loadRegistry(REGISTRY_PATH);
      const actual = Object.fromEntries(
        registry.gates.filter((g) => g.firingChannel === channel).map((g) => [g.id, g.severity]),
      );
      expect(
        actual,
        `${channel} is a blocking channel: a gate was added to it, removed from it, or had its ` +
          'severity changed. Decide the severity on purpose (docs/guardrails/SCHEMA.md → ' +
          '"Severity semantics"), then update DECIDED here and the curation record there.',
      ).toEqual(DECIDED[channel]);
    },
  );

  it('every registry severity is one run-gates recognises', () => {
    const { registry } = loadRegistry(REGISTRY_PATH);
    const unknown = registry.gates
      .filter((g) => !['error', 'warn', 'info'].includes(g.severity))
      .map((g) => `${g.id}:${g.severity}`);
    expect(unknown).toEqual([]);
  });
});

describe('summarizeRun', () => {
  const pass = { id: 'p', severity: 'error', exitCode: 0, outcome: 'pass' };
  const warned = { id: 'w', severity: 'warn', exitCode: 1, outcome: 'warn' };
  const failed = { id: 'f', severity: 'error', exitCode: 1, outcome: 'fail' };

  it('exits 0 when every gate passed', () => {
    expect(summarizeRun([pass])).toEqual({ failures: [], warnings: [], exitCode: 0 });
  });

  it('exits 0 when only warn gates reported findings, and lists them', () => {
    expect(summarizeRun([pass, warned])).toEqual({
      failures: [],
      warnings: [warned],
      exitCode: 0,
    });
  });

  it('exits 1 when any error gate failed, keeping warnings separate', () => {
    expect(summarizeRun([warned, failed, pass])).toEqual({
      failures: [failed],
      warnings: [warned],
      exitCode: 1,
    });
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
    writeFileSync(script, 'const end = Date.now() + 5000; while (Date.now() < end) {}\n');
    const r = runGateCaptured(script, { timeoutMs: 150 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBe(null);
  });
});
