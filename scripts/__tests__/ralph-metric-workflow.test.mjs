/**
 * Contract test for .github/workflows/ralph-metric.yml (ops#90) — the bounded
 * metric loop's thin caller.
 *
 * Workflow YAML cannot run locally, so the invariants that make the loop SAFE
 * are pinned here as text assertions (no YAML parser dependency, same stance
 * as scripts/lib/yaml-comments.mjs):
 *
 *   - workflow_dispatch ONLY — a cron needs Adrian's separate per-item yes.
 *   - its concurrency group is NOT ralph.yml's (sharing it lets a metric
 *     dispatch cancel a pending issue-loop run, stranding its claim).
 *   - dispatch inputs reach run scripts only through env, never interpolated
 *     into the script text (script injection).
 *   - the batch branch is `ralph/metric-*`, or ralph-gate waves it through as
 *     a human PR with no gate and no AI review.
 *   - the batch PR carries no closing keyword (GitHub would close the named
 *     issue on merge, and ralph-gate would treat it as the PR's linked issue
 *     for `ralph-auto` pre-approval).
 *   - claude-code-action is invoked the way the Ralph engine invokes it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripYamlComments } from '../lib/yaml-comments.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW = path.join(ROOT, '.github/workflows/ralph-metric.yml');
const RALPH_YML = path.join(ROOT, '.github/workflows/ralph.yml');
const REGISTRY = path.join(ROOT, 'docs/guardrails/registry.json');

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '');
const raw = read(WORKFLOW);
const code = stripYamlComments(raw);

/** Lines of a top-level block (`key:` at column 0) up to the next top-level key. */
function topLevelBlock(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `${key}:`);
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    out.push(line);
  }
  return out;
}

const unquote = (v) => v.trim().replace(/^['"]|['"]$/g, '');

function concurrencyGroup(text) {
  const line = topLevelBlock(stripYamlComments(text), 'concurrency').find((l) =>
    /^\s+group:/.test(l),
  );
  return line ? unquote(line.replace(/^\s+group:/, '')) : null;
}

/** Lines of job `name` (under `jobs:`), up to the next job or top-level key. */
function jobBlock(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start === -1) return '';
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const indent = line.search(/\S/);
    if (indent !== -1 && indent <= 2) break;
    out.push(line);
  }
  return out.join('\n');
}

/** The `run: |` script of the step whose `- name:` starts with `prefix`. */
function stepRun(text, prefix) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trimStart().startsWith(`- name: ${prefix}`));
  if (start === -1) return '';
  const stepIndent = lines[start].search(/\S/);
  const out = [];
  let runIndent = -1;
  for (const line of lines.slice(start + 1)) {
    const indent = line.search(/\S/);
    if (indent !== -1 && indent <= stepIndent) break; // next step, job, or key
    if (runIndent === -1) {
      if (/^\s+run: \|\s*$/.test(line)) runIndent = indent;
      continue;
    }
    if (indent !== -1 && indent <= runIndent) break;
    out.push(line);
  }
  return out.join('\n');
}

/** The block-scalar prompt handed to claude-code-action. */
function promptText(text) {
  const m = /\n(\s+)prompt: \|\n((?:\1\s+.*\n|\s*\n)+)/.exec(text);
  return m ? m[2] : '';
}

describe('ralph-metric.yml — bounded metric loop caller (ops#90)', () => {
  it('exists', () => {
    expect(raw, `${path.relative(ROOT, WORKFLOW)} is missing`).not.toBe('');
  });

  describe('triggers', () => {
    it('is workflow_dispatch ONLY — no schedule, push, PR, or issue trigger', () => {
      const triggers = topLevelBlock(code, 'on')
        .map((l) => /^ {2}([\w-]+):/.exec(l)?.[1])
        .filter(Boolean);
      expect(triggers).toEqual(['workflow_dispatch']);
      expect(code).not.toMatch(/^\s*schedule:/m);
      expect(code).not.toMatch(/^\s*-\s*cron:/m);
    });

    it('documents the no-schedule rule in the header comment', () => {
      const header = raw
        .split('\n')
        .filter((l) => l.startsWith('#'))
        .join('\n');
      expect(header).toMatch(/workflow_dispatch/);
      expect(header).toMatch(/schedule/);
      expect(header).toMatch(/per-item/);
    });

    it('requires both the metric and target inputs', () => {
      const on = topLevelBlock(code, 'on').join('\n');
      expect(on).toMatch(/\n\s+metric:\n(?:\s+.*\n)*?\s+required: true/);
      expect(on).toMatch(/\n\s+target:\n(?:\s+.*\n)*?\s+required: true/);
    });
  });

  describe('concurrency', () => {
    it('serializes metric dispatches without cancelling an in-flight one', () => {
      expect(concurrencyGroup(raw)).toBeTruthy();
      const block = topLevelBlock(code, 'concurrency').join('\n');
      expect(block).toMatch(/cancel-in-progress: false/);
    });

    it("does NOT share ralph.yml's group (a queued run cancels the pending one)", () => {
      const issueLoopGroup = concurrencyGroup(read(RALPH_YML));
      expect(issueLoopGroup, 'ralph.yml concurrency group not found').toBeTruthy();
      expect(concurrencyGroup(raw)).not.toBe(issueLoopGroup);
    });
  });

  describe('measure', () => {
    it('measures through ralph/metric.sh (the exit-code contract lives there)', () => {
      expect(code).toMatch(/bash ralph\/metric\.sh "\$METRIC" "\$TARGET"/);
    });

    it('passes dispatch inputs only through env, never interpolated into a script', () => {
      const uses = code.split('\n').filter((l) => l.includes('${{ inputs.'));
      expect(uses.length).toBeGreaterThan(0);
      for (const line of uses) {
        expect(line).toMatch(/^\s+[A-Z_]+: \$\{\{ inputs\.\w+ \}\}$/);
      }
    });

    it('re-uses the single-flight guard before starting a batch', () => {
      expect(code).toMatch(/open_ralph_prs/);
      expect(code).toMatch(/ralph\/claim-/);
    });

    it('sets up Node the way the other pnpm workflows do', () => {
      expect(code).toMatch(/uses: actions\/checkout@v4/);
      expect(code).toMatch(/uses: pnpm\/action-setup@v4/);
      expect(code).toMatch(/uses: actions\/setup-node@v4/);
      expect(code).toMatch(/node-version: ['"]?22['"]?/);
      expect(code).toMatch(/pnpm install --frozen-lockfile/);
    });
  });

  describe('single-flight guard', () => {
    const guard = stepRun(code, 'Single-flight guard');

    it('exists as a run step', () => {
      expect(guard, 'Single-flight guard run script not found').not.toBe('');
    });

    // Claim refs leak (7 on 2026-09-16, every issue closed since July). A guard
    // that blocks on ANY claim ref skips every batch until a human deletes them
    // by hand; ralph.yml never blocks on other issues' claims at all.
    it('blocks only on LIVE claims — a leaked claim ref must not stall the loop', () => {
      expect(guard).toMatch(/\. ralph\/lib\.sh/);
      expect(guard).toMatch(/claim_is_stale "\$n"/);
      expect(guard, 'a claim on a closed issue must read as stale').toMatch(/"OPEN"/);
    });

    // claim_is_stale reads the issue's claim comments. Without issues: read the
    // `gh issue view` inside it fails, `last` is empty, and EVERY claim —
    // live ones included — reads as stale.
    it('grants the measure job issues: read', () => {
      expect(jobBlock(code, 'measure')).toMatch(
        /\n\s+permissions:\n(?:\s+[\w-]+: \w+\n)*?\s+issues: read\n/,
      );
    });

    it('fails closed — a gh/git failure aborts red, never reads as nothing in flight', () => {
      // Actions' default `bash -e` has no pipefail: `git ls-remote | sed` would
      // turn a failed ls-remote into an empty (idle) claim list.
      expect(guard).toMatch(/set -euo pipefail/);
      // claim_is_stale swallows API errors as "stale"; the guard probes each
      // claim's issue first, un-swallowed, so an outage stops the step instead.
      const probe = guard.split('\n').find((l) => /gh issue view "\$n"/.test(l));
      expect(probe, 'no fail-closed gh issue view probe per claim').toBeTruthy();
      expect(probe).not.toMatch(/\|\| (true|echo)|2>\/dev\/null/);
    });
  });

  describe('batch', () => {
    it('runs only when the measure job decided a batch is needed', () => {
      expect(code).toMatch(/if: needs\.measure\.outputs\.decision == 'batch'/);
    });

    it('invokes claude-code-action like the Ralph engine — OAuth token, no API key', () => {
      expect(code).toMatch(/uses: anthropics\/claude-code-action@v1/);
      expect(code).toMatch(/claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/);
      expect(code).toMatch(/--allowedTools "Bash,Read,Write,Edit,Glob,Grep"/);
      expect(code).not.toMatch(/anthropic_api_key/);
    });

    it('names a ralph/metric-* branch so ralph-gate gates it as a Ralph PR', () => {
      const prompt = promptText(raw);
      expect(prompt, 'prompt block not found').not.toBe('');
      expect(prompt).toMatch(/ralph\/metric-/);
      expect(prompt).toMatch(/bash ralph\/gate\.sh/);
    });

    it('never tells the model to use a closing keyword in the PR body', () => {
      const prompt = promptText(raw);
      expect(prompt).not.toMatch(/\b(close[sd]?|fix(e[sd])?|resolve[sd]?) #\d+/i);
    });

    it('never lets the model game the measurement', () => {
      expect(promptText(raw)).toMatch(/do not edit the measuring gate/i);
    });
  });

  describe('reconcile', () => {
    const reconcile = stepRun(code, 'Reconcile');

    it('exists as a run step', () => {
      expect(reconcile, 'Reconcile run script not found').not.toBe('');
    });

    // By the time Reconcile runs, claude-code-action has pointed origin at a URL
    // carrying its app token and then revoked that token (`Revoke app token`,
    // if: always()), so anything that talks to origin fails auth on this
    // private repo.
    it('checks the pushed branch through the job token, never through origin', () => {
      expect(reconcile).not.toMatch(/\borigin\b/);
      expect(reconcile).toMatch(/gh api "repos\/\$GITHUB_REPOSITORY\/git\/ref\/heads\/\$BRANCH"/);
      expect(reconcile).toMatch(/gh pr list -R "\$GITHUB_REPOSITORY"/);
    });

    it('a failed branch check is its own red outcome, never "not pushed"', () => {
      expect(reconcile).toMatch(/HTTP 404/);
      expect(reconcile).toMatch(/could not check/i);
    });
  });

  it('names no registry gate script outside comments (would read as CI wiring)', () => {
    const { gates } = JSON.parse(read(REGISTRY));
    const named = gates
      .map((g) => g.gateScript)
      .filter(Boolean)
      .filter((s) => code.includes(s) || code.includes(path.basename(s)));
    expect(named).toEqual([]);
  });
});
