import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  emitRegistrySkeleton,
  emitSteeringSkeleton,
  classifyPromotion,
  summarizeRules,
  buildListOutput,
  buildJsonOutput,
  STEERING_TARGETS,
  DEFAULT_STEERING_TARGET,
} from '../promote-learned-rule.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'promote-learned-rule.mjs');

const RULE = {
  rule: 'Check the claude-step outcome before counting it against the attempt budget.',
  rationale: 'ops#44 attempt-failures were bot-actor push rejections, not the issue.',
  applies_to: 'all',
  source: 'park-harvest',
  evidence_unit_id: 'ops#44',
  ts: '2026-09-14T20:26:52.619826Z',
};

// ── Pure staging logic ──────────────────────────────────────────────────────

describe('emitRegistrySkeleton', () => {
  it('stages a registry skeleton without writing anything', () => {
    const { suggestedId, promotedTo, skeleton } = emitRegistrySkeleton(RULE, 'learned-ops44-test');
    expect(suggestedId).toBe('learned-ops44-test');
    expect(promotedTo).toBe('registry:learned-ops44-test');
    expect(skeleton.id).toBe('learned-ops44-test');
    expect(skeleton.gateScript).toBe('scripts/check-learned-ops44-test.mjs');
    expect(skeleton.learnedFrom).toBe('ops#44');
    expect(skeleton.rationale).toBe(RULE.rationale);
  });

  it('derives a suggested id from evidence_unit_id when none is given', () => {
    const { suggestedId } = emitRegistrySkeleton(RULE);
    expect(suggestedId).toMatch(/^learned-ops-44-\d+$/);
  });
});

describe('emitSteeringSkeleton', () => {
  it('stages a one-line bullet for the given target file', () => {
    const { targetFile, promotedTo, line } = emitSteeringSkeleton(RULE, 'AGENTS.md');
    expect(targetFile).toBe('AGENTS.md');
    expect(promotedTo).toBe('steering:AGENTS.md');
    expect(line).toBe(`- **${RULE.rule}** ${RULE.rationale}`);
  });

  it('falls back to the default steering target when none is given', () => {
    const { targetFile, promotedTo } = emitSteeringSkeleton(RULE);
    expect(targetFile).toBe(DEFAULT_STEERING_TARGET);
    expect(promotedTo).toBe(`steering:${DEFAULT_STEERING_TARGET}`);
  });

  it('exposes the destination guidance used to prompt for a target file', () => {
    const files = STEERING_TARGETS.map((t) => t.file);
    expect(files).toEqual(['AGENTS.md', 'CLAUDE.md', 'docs/ai/AGENT_GUIDELINES.md']);
  });
});

describe('classifyPromotion', () => {
  it('classifies a gate promotion', () => {
    expect(classifyPromotion('registry:learned-ops44-1')).toEqual({
      destination: 'gate',
      target: 'learned-ops44-1',
    });
  });

  it('classifies a steering promotion', () => {
    expect(classifyPromotion('steering:CLAUDE.md')).toEqual({
      destination: 'steering',
      target: 'CLAUDE.md',
    });
  });

  it('treats an unprefixed value as legacy', () => {
    expect(classifyPromotion('learned-ops44-1')).toEqual({
      destination: 'legacy',
      target: 'learned-ops44-1',
    });
  });

  it('returns null for no promotion', () => {
    expect(classifyPromotion(undefined)).toBeNull();
  });
});

// ── Summary / list / json over a stubbed set of rules (no file I/O) ─────────

const STUBBED_RULES = [
  { ...RULE, evidence_unit_id: 'ops#1' },
  {
    ...RULE,
    evidence_unit_id: 'ops#2',
    promotedAt: '2026-09-16T00:00:00Z',
    promotedTo: 'registry:learned-ops2-1',
  },
  {
    ...RULE,
    evidence_unit_id: 'ops#3',
    promotedAt: '2026-09-16T00:00:00Z',
    promotedTo: 'steering:CLAUDE.md',
  },
];

describe('summarizeRules', () => {
  it('splits rules into unpromoted / gate / steering', () => {
    const summary = summarizeRules(STUBBED_RULES);
    expect(summary.total).toBe(3);
    expect(summary.unpromoted).toHaveLength(1);
    expect(summary.gate).toHaveLength(1);
    expect(summary.steering).toHaveLength(1);
  });
});

describe('buildListOutput', () => {
  it('reports the gate/steering breakdown in the summary line', () => {
    const out = buildListOutput(STUBBED_RULES);
    expect(out).toContain('3 total · 1 unpromoted · 2 promoted (1 gate, 1 steering)');
    expect(out).toContain('[ops#1]');
  });
});

describe('buildJsonOutput', () => {
  it('reflects the destination for each promoted rule and a summary count', () => {
    const out = buildJsonOutput(STUBBED_RULES);
    expect(out.promotedByDestination).toEqual({ gate: 1, steering: 1 });
    const gateRule = out.promoted.find((r) => r.evidence_unit_id === 'ops#2');
    const steeringRule = out.promoted.find((r) => r.evidence_unit_id === 'ops#3');
    expect(gateRule.promotedDestination).toBe('gate');
    expect(steeringRule.promotedDestination).toBe('steering');
  });
});

// ── CLI wiring: --list / --json against a stubbed JSONL file, no prompts ────

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'promote-learned-rule-'));
  cleanup.push(dir);
  return dir;
}

function writeFixture(dir, rules) {
  const p = join(dir, 'learned-rules.jsonl');
  writeFileSync(p, rules.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return p;
}

function run(args) {
  return execFileSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

describe('promote-learned-rule CLI', () => {
  it('--json against a fixture file reflects destinations without prompting', () => {
    const dir = tmp();
    const fixture = writeFixture(dir, STUBBED_RULES);
    const stdout = run(['--json', '--fixture-file', fixture]);
    const parsed = JSON.parse(stdout);
    expect(parsed.totalRules).toBe(3);
    expect(parsed.promotedByDestination).toEqual({ gate: 1, steering: 1 });
  });

  it('--list against a fixture file reflects destinations without prompting', () => {
    const dir = tmp();
    const fixture = writeFixture(dir, STUBBED_RULES);
    const stdout = run(['--list', '--fixture-file', fixture]);
    expect(stdout).toContain('1 gate, 1 steering');
  });
});
