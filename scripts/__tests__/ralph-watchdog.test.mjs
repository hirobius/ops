import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  decideWatchdogAction,
  isMutating,
  ACTION,
  IDLE_REASON,
  DIFF_UNREADABLE,
  GATE_PENDING_STALE_MINUTES,
} from '../../lib/ops/ralph-watchdog.mjs';

const pr = (over = {}) => ({
  number: 100,
  headRef: 'ralph/issue-330-telemetry',
  gateConclusion: 'success',
  mergeable: true,
  mergeableState: 'clean',
  supervisedFiles: [],
  ...over,
});

describe('ralph-watchdog: the wedge is decided before the queue', () => {
  // The five-hour wedge on 2026-09-16 happened because the queue looked
  // healthy. It WAS healthy — and entirely blocked. An open PR must always
  // win over queue state, or the watchdog reproduces the original blind spot.
  it('acts on an open PR even when the queue is full and a run is in flight', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr()],
      readyIssueCount: 9,
      runInProgress: true,
    });
    expect(d.action).toBe(ACTION.MERGE);
  });

  it('never dispatches while any ralph/* PR is open', () => {
    for (const gate of ['success', 'failure', 'pending', null]) {
      const d = decideWatchdogAction({
        openRalphPrs: [pr({ gateConclusion: gate })],
        readyIssueCount: 5,
        runInProgress: false,
      });
      expect(d.action).not.toBe(ACTION.DISPATCH);
    }
  });
});

describe('ralph-watchdog: open-PR states', () => {
  it('merges a green, non-draft PR — the auto-merge did not arm', () => {
    const d = decideWatchdogAction({ openRalphPrs: [pr()], readyIssueCount: 1 });
    expect(d.action).toBe(ACTION.MERGE);
    expect(d.reason).toMatch(/FULL head SHA/);
  });

  it('does NOT merge a green PR that touches a supervised path without ralph-approved', () => {
    // ops#238 (decided 2026-09-14): auto-merge on green is the default, but a
    // diff into the revenue path — client-facing output, client PII, money —
    // needs a human. Before this, the watchdog merged any green PR, so the
    // boundary existed on paper only.
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ supervisedFiles: ['lib/leads/pipeline.mjs'] })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
    expect(d.reason).toMatch(/lib\/leads\/pipeline\.mjs/);
    expect(d.reason).toMatch(/ralph-approved/);
  });

  it('merges a supervised-path PR once a human adds ralph-approved', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ supervisedFiles: ['lib/agent/llm.mjs'], prApproved: true })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.MERGE);
  });

  it('fails CLOSED when the diff could not be read — never merges on unknown', () => {
    for (const supervisedFiles of [null, undefined]) {
      const d = decideWatchdogAction({
        openRalphPrs: [pr({ supervisedFiles })],
        readyIssueCount: 1,
      });
      expect(d.action).toBe(ACTION.IDLE);
      expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
      expect(d.reason).toMatch(/could not read/i);
    }
  });

  it('an API-error diff says the next tick retries — it is transient', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ supervisedFiles: null, diffUnreadable: DIFF_UNREADABLE.API_ERROR })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
    expect(d.reason).toMatch(/next tick retries/i);
  });

  it('a diff past GitHub’s 3000-file cap never promises a retry — only a human unblocks it', () => {
    // The old reason said "the next tick retries" for a diff that could never
    // be read, so the queue sat wedged behind a promise that could not keep.
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ supervisedFiles: null, diffUnreadable: DIFF_UNREADABLE.FILE_CAP })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
    expect(d.reason).toMatch(/3000/);
    expect(d.reason).toMatch(/ralph-approved/);
    expect(d.reason).not.toMatch(/next tick retries/i);
  });

  it('ralph-approved still merges a PR whose diff could not be read', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [
        pr({ supervisedFiles: null, diffUnreadable: DIFF_UNREADABLE.FILE_CAP, prApproved: true }),
      ],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.MERGE);
  });

  it('does NOT merge a green DRAFT pr — a draft cannot merge however green', () => {
    const d = decideWatchdogAction({ openRalphPrs: [pr({ draft: true })], readyIssueCount: 1 });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.reason).toMatch(/DRAFT/);
  });

  it('asks a human when a supervised PR waits — AWAITING_APPROVAL is a write, not a silent idle', () => {
    // An IDLE decision used to write nothing, and the engine's classify_wedged
    // reads a green status as healthy — so a supervised PR could hold the
    // single-flight queue all weekend with no page to anyone.
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ supervisedFiles: ['lib/leads/pipeline.mjs'] })],
      readyIssueCount: 3,
    });
    expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
    expect(d.needsHuman).toBe(true);
    expect(isMutating(d)).toBe(true);
  });

  it('asks a human for a diff past the file cap — no retry can clear it', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ supervisedFiles: null, diffUnreadable: DIFF_UNREADABLE.FILE_CAP })],
      readyIssueCount: 1,
    });
    expect(d.needsHuman).toBe(true);
    expect(isMutating(d)).toBe(true);
  });

  it('does NOT page a human for a transient API error — the next tick retries first', () => {
    for (const diffUnreadable of [DIFF_UNREADABLE.API_ERROR, null, undefined]) {
      const d = decideWatchdogAction({
        openRalphPrs: [pr({ supervisedFiles: null, diffUnreadable })],
        readyIssueCount: 1,
      });
      expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
      expect(d.needsHuman).toBeFalsy();
      expect(isMutating(d)).toBe(false);
    }
  });

  it('does not merge before GitHub has computed mergeability — unknown is not clean', () => {
    // pulls/{n} returns mergeable: null until GitHub finishes computing it,
    // and the list endpoint never carries it at all. Merging on unknown got a
    // 405 that exited 2 every hour instead of reporting the conflict.
    for (const mergeable of [null, undefined]) {
      const d = decideWatchdogAction({
        openRalphPrs: [pr({ mergeable, mergeableState: 'unknown' })],
        readyIssueCount: 1,
      });
      expect(d.action).toBe(ACTION.IDLE);
      expect(d.idleReason).toBe(IDLE_REASON.MERGEABILITY_PENDING);
      expect(d.reason).toMatch(/next tick/i);
      expect(isMutating(d)).toBe(false);
    }
  });

  it('a supervised PR still waits for approval while mergeability is unknown', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ mergeable: null, supervisedFiles: ['lib/render/site.mjs'] })],
      readyIssueCount: 1,
    });
    expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
  });

  it('treats mergeable:false as a conflict even without a dirty mergeable_state', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ mergeable: false, mergeableState: undefined })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.RESOLVE_CONFLICT);
  });

  it('resolves a conflict before looking at the gate', () => {
    // dirty + green gate: the conflict is the blocker, not the gate.
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ mergeableState: 'dirty', gateConclusion: 'success' })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.RESOLVE_CONFLICT);
    expect(d.reason).toMatch(/never rebase or force-push/i);
  });

  it('fixes a red gate at its cause on the first failure', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ gateConclusion: 'failure' })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.FIX);
  });

  it('abandons a red gate once the bounded self-heal is spent', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ gateConclusion: 'failure', selfhealAttempted: true })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.ABANDON);
  });

  it('never suggests skipping a test or an empty commit, on any red path', () => {
    for (const spent of [false, true]) {
      const d = decideWatchdogAction({
        openRalphPrs: [pr({ gateConclusion: 'failure', selfhealAttempted: spent })],
        readyIssueCount: 1,
      });
      expect(d.reason).toMatch(/never (skip|push an empty)|do not skip/i);
    }
  });

  it('waits while the gate is genuinely still running', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ gateConclusion: 'pending', gatePendingMinutes: 4 })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.GATE_PENDING);
  });

  it('treats a long-pending gate as stuck, not slow', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [
        pr({ gateConclusion: 'pending', gatePendingMinutes: GATE_PENDING_STALE_MINUTES }),
      ],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.FIX);
  });

  it('closes a PR whose issue already closed — finished work holding the queue', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ issueClosed: true, gateConclusion: 'failure' })],
      readyIssueCount: 1,
    });
    expect(d.action).toBe(ACTION.ABANDON);
    expect(d.reason).toMatch(/already closed/);
  });
});

describe('ralph-watchdog: single-flight invariant broken', () => {
  it('acts on the OLDEST pr and reports the others', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ number: 210 }), pr({ number: 118 }), pr({ number: 305 })],
      readyIssueCount: 2,
    });
    expect(d.pr.number).toBe(118);
    expect(d.alsoOpen.map((p) => p.number)).toEqual([210, 305]);
  });

  it('omits alsoOpen when the invariant holds', () => {
    const d = decideWatchdogAction({ openRalphPrs: [pr()], readyIssueCount: 1 });
    expect(d.alsoOpen).toBeUndefined();
  });
});

describe('ralph-watchdog: no PR open', () => {
  it('dispatches when work is queued and nothing is in flight', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [],
      readyIssueCount: 4,
      runInProgress: false,
    });
    expect(d.action).toBe(ACTION.DISPATCH);
  });

  it('does not race a run already in progress', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [],
      readyIssueCount: 4,
      runInProgress: true,
    });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.RUN_IN_PROGRESS);
  });

  it('distinguishes an EXHAUSTED queue from a stalled one', () => {
    // This is the signal that the backlog is out of work — re-dispatching
    // cannot help, and a human has to decide what is next. Conflating it with
    // a stall would produce an infinite dispatch loop against an empty queue.
    const d = decideWatchdogAction({
      openRalphPrs: [],
      readyIssueCount: 0,
      runInProgress: false,
    });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.QUEUE_EMPTY);
    expect(d.reason).toMatch(/EXHAUSTED/);
  });

  it('an empty queue stays idle even if a run is somehow in flight', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [],
      readyIssueCount: 0,
      runInProgress: true,
    });
    expect(d.idleReason).toBe(IDLE_REASON.QUEUE_EMPTY);
  });
});

describe('ralph-watchdog: determinism and defaults', () => {
  it('is a pure function of its facts — same input, same decision', () => {
    const facts = {
      openRalphPrs: [pr({ gateConclusion: 'failure' })],
      readyIssueCount: 3,
      runInProgress: false,
    };
    const runs = Array.from({ length: 5 }, () => decideWatchdogAction(facts));
    for (const r of runs) expect(r).toEqual(runs[0]);
  });

  it('does not mutate the facts it is given', () => {
    const prs = [pr({ number: 9 }), pr({ number: 2 })];
    const snapshot = JSON.parse(JSON.stringify(prs));
    decideWatchdogAction({ openRalphPrs: prs, readyIssueCount: 1 });
    expect(prs).toEqual(snapshot);
  });

  it('parses the issue number out of the branch ref', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ headRef: 'ralph/issue-347-health-check' })],
      readyIssueCount: 1,
    });
    expect(d.pr.issueNumber).toBe(347);
  });

  it('survives a malformed ref without throwing', () => {
    const d = decideWatchdogAction({
      openRalphPrs: [pr({ headRef: 'ralph/hotfix-no-issue' })],
      readyIssueCount: 1,
    });
    expect(d.pr.issueNumber).toBeNull();
  });

  it('treats absent facts as an empty, idle world rather than throwing', () => {
    expect(decideWatchdogAction({}).action).toBe(ACTION.IDLE);
    expect(decideWatchdogAction().action).toBe(ACTION.IDLE);
  });

  it('isMutating separates the write actions from idle', () => {
    expect(isMutating({ action: ACTION.IDLE })).toBe(false);
    // …except the one idle that asks a human: posting that ask is a write.
    expect(isMutating({ action: ACTION.IDLE, needsHuman: true })).toBe(true);
    for (const a of [
      ACTION.MERGE,
      ACTION.FIX,
      ACTION.ABANDON,
      ACTION.DISPATCH,
      ACTION.RESOLVE_CONFLICT,
    ]) {
      expect(isMutating({ action: a })).toBe(true);
    }
  });

  it('every decision names a cause AND a next step', () => {
    // The repo's standing convention: fail loud and actionable, never a bare
    // "health check failed". A watchdog nobody can act on is noise.
    const cases = [
      { openRalphPrs: [pr()], readyIssueCount: 1 },
      { openRalphPrs: [pr({ gateConclusion: 'failure' })], readyIssueCount: 1 },
      { openRalphPrs: [pr({ mergeableState: 'dirty' })], readyIssueCount: 1 },
      { openRalphPrs: [], readyIssueCount: 3 },
      { openRalphPrs: [], readyIssueCount: 0 },
    ];
    for (const c of cases) {
      const d = decideWatchdogAction(c);
      expect(d.reason.length).toBeGreaterThan(40);
    }
  });
});

// ---------------------------------------------------------------------------
// I/O half: gatherFacts + applyDecision against an injected fake port.
// No network, no fixtures on disk — the port is the seam.
// ---------------------------------------------------------------------------
import {
  gatherFacts,
  applyDecision,
  makeGitHubPort,
  buildReport,
  BOUNDARY_SELF_PATHS,
  HUMAN_LABEL,
} from '../ralph-watchdog.mjs';

const NOW = Date.parse('2026-09-16T08:00:00Z');
/** `head.repo` as pulls?state=open returns it for a branch in this repo. */
const HEAD_REPO = { full_name: 'hirobius/ops' };

const fakePort = (over = {}) => ({
  listOpenPrs: async () => [],
  listReadyIssues: async () => [],
  listRuns: async () => ({ workflow_runs: [] }),
  listCheckRuns: async () => ({ check_runs: [] }),
  getCombinedStatus: async () => ({ state: 'pending', statuses: [] }),
  getIssue: async () => ({ state: 'open' }),
  getPr: async () => ({ mergeable: true, mergeable_state: 'clean' }),
  listPrFiles: async () => [],
  listComments: async () => [],
  ...over,
});

const greenStatus = async () => ({ statuses: [{ context: 'ralph-gate', state: 'success' }] });

describe('gatherFacts: only same-repo ralph/* heads are Ralph PRs', () => {
  // ops is PUBLIC. The engine posts `ralph-gate: success` ("non-Ralph PR —
  // human-reviewed") on the head SHA of every human PR. A fork branch named
  // `ralph/...` pointing at one of those SHAs used to read as a green Ralph PR
  // with no supervised files — and the watchdog squash-merged it to main.
  const forkExploit = (repo) =>
    fakePort({
      listOpenPrs: async () => [
        {
          number: 9999,
          head: { repo, ref: 'ralph/issue-9999-x', sha: 'c'.repeat(40) },
          labels: [],
        },
      ],
      getCombinedStatus: async () => ({
        statuses: [
          { context: 'ralph-gate', state: 'success', description: 'non-Ralph PR — human-reviewed' },
        ],
      }),
      listPrFiles: async () => [{ filename: 'api/ops-login.ts' }],
    });

  it('ignores a fork PR on a ralph/* branch, however green its SHA looks', async () => {
    const f = await gatherFacts(forkExploit({ full_name: 'mallory/ops' }), NOW);
    expect(f.openRalphPrs).toHaveLength(0);
    const d = decideWatchdogAction(f);
    expect(d.action).not.toBe(ACTION.MERGE);
  });

  it('ignores a PR whose head repo is gone (deleted fork)', async () => {
    for (const repo of [null, undefined]) {
      const f = await gatherFacts(forkExploit(repo), NOW);
      expect(f.openRalphPrs).toHaveLength(0);
    }
  });

  it('ignores ralph/claim-* refs, matching lib.sh open_ralph_prs', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 5, head: { repo: HEAD_REPO, ref: 'ralph/claim-5', sha: 's' }, labels: [] },
        ],
      }),
      NOW,
    );
    expect(f.openRalphPrs).toHaveLength(0);
  });

  it('matches the head repo case-insensitively, so a repo slug in other case still sees the PR', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
        ],
      }),
      NOW,
      { repo: 'Hirobius/OPS' },
    );
    expect(f.openRalphPrs.map((p) => p.number)).toEqual([9]);
  });

  it('never reads the engine pass-through status as green on a same-repo ralph/* PR', async () => {
    // Defense in depth: that description is only ever posted for NON-Ralph
    // PRs. On a ralph/* head it means the real gate has not spoken for this SHA.
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
        ],
        getCombinedStatus: async () => ({
          statuses: [
            {
              context: 'ralph-gate',
              state: 'success',
              description: 'non-Ralph PR — human-reviewed',
            },
          ],
        }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].gateConclusion).toBe('pending');
    expect(decideWatchdogAction({ ...f, readyIssueCount: 1 }).action).not.toBe(ACTION.MERGE);
  });
});

describe('gatherFacts: mergeability comes from the single-PR endpoint', () => {
  // Real pulls?state=open entries have NO mergeable / mergeable_state field
  // (verified live on all 12 open PRs), so `dirty` could never be seen there.
  const listShaped = async () => [
    {
      number: 9,
      draft: false,
      head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 'a'.repeat(40) },
      labels: [],
    },
  ];

  it('sees a conflict the list response hides, and reports it instead of merging', async () => {
    const asked = [];
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: listShaped,
        getCombinedStatus: greenStatus,
        getPr: async (n) => {
          asked.push(n);
          return { mergeable: false, mergeable_state: 'dirty', head: { sha: 'a'.repeat(40) } };
        },
      }),
      NOW,
    );
    expect(asked).toEqual([9]);
    expect(f.openRalphPrs[0]).toMatchObject({ mergeable: false, mergeableState: 'dirty' });
    expect(decideWatchdogAction({ ...f, readyIssueCount: 1 }).action).toBe(ACTION.RESOLVE_CONFLICT);
  });

  it('holds a green PR while GitHub is still computing mergeability', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: listShaped,
        getCombinedStatus: greenStatus,
        getPr: async () => ({ mergeable: null, mergeable_state: 'unknown' }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].mergeable).toBeNull();
    const d = decideWatchdogAction({ ...f, readyIssueCount: 1 });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.MERGEABILITY_PENDING);
  });

  it('treats mergeability as unknown when the head moved between the two reads', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: listShaped,
        getCombinedStatus: greenStatus,
        getPr: async () => ({
          mergeable: true,
          mergeable_state: 'clean',
          head: { sha: 'b'.repeat(40) },
        }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].mergeable).toBeNull();
    expect(decideWatchdogAction({ ...f, readyIssueCount: 1 }).action).not.toBe(ACTION.MERGE);
  });

  it('merges a clean, green, unsupervised PR read from real endpoint shapes', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: listShaped,
        getCombinedStatus: greenStatus,
        getPr: async () => ({
          mergeable: true,
          mergeable_state: 'clean',
          head: { sha: 'a'.repeat(40) },
        }),
        listPrFiles: async () => [{ filename: 'docs/ai/notes.md' }],
      }),
      NOW,
    );
    expect(decideWatchdogAction({ ...f, readyIssueCount: 1 }).action).toBe(ACTION.MERGE);
  });
});

describe('gatherFacts: the boundary supervises its own definition', () => {
  // If the files that define and enforce the boundary merged unattended, the
  // first merge that weakened them would become the rule for every later PR.
  const withFiles = (files) =>
    fakePort({
      listOpenPrs: async () => [
        { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
      ],
      getCombinedStatus: greenStatus,
      listPrFiles: async () => files.map((filename) => ({ filename })),
    });

  it('holds a PR that edits any boundary file for ralph-approved', async () => {
    for (const file of [
      'scripts/metric-north-star-share.mjs',
      'scripts/ralph-watchdog.mjs',
      'lib/ops/ralph-watchdog.mjs',
      '.github/workflows/ralph-watchdog.yml',
    ]) {
      const f = await gatherFacts(withFiles([file, 'docs/x.md']), NOW);
      expect(f.openRalphPrs[0].supervisedFiles).toEqual([file]);
      const d = decideWatchdogAction({ ...f, readyIssueCount: 1 });
      expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
    }
  });

  it('BOUNDARY_SELF_PATHS covers the watchdog’s whole local import graph and its workflow', () => {
    // Self-maintaining: add an import to the watchdog without supervising the
    // new file, and this fails. Walks static and dynamic relative imports.
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const seen = new Set();
    const walk = (rel) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const src = readFileSync(join(root, rel), 'utf8');
      const specs = [
        ...src.matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g),
        ...src.matchAll(/\bimport\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g),
      ].map((m) => m[1]);
      for (const spec of specs) {
        walk(join(dirname(rel), spec).split('\\').join('/'));
      }
    };
    walk('scripts/ralph-watchdog.mjs');
    expect(seen.size).toBeGreaterThan(2);
    for (const file of seen) expect(BOUNDARY_SELF_PATHS).toContain(file);
    expect(BOUNDARY_SELF_PATHS).toContain('.github/workflows/ralph-watchdog.yml');
  });
});

describe('gatherFacts', () => {
  it('ignores non-ralph branches when looking for the wedge', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [{ number: 1, head: { ref: 'claude/docs', sha: 'a' } }],
      }),
      NOW,
    );
    expect(f.openRalphPrs).toHaveLength(0);
  });

  it('does NOT count pull requests toward the ready-issue count', async () => {
    // GitHub's issues endpoint returns PRs too. Counting them inflates the
    // queue and makes an empty backlog look like it still has work.
    const f = await gatherFacts(
      fakePort({
        listReadyIssues: async () => [{ number: 5 }, { number: 6, pull_request: { url: 'x' } }],
      }),
      NOW,
    );
    expect(f.readyIssueCount).toBe(1);
  });

  it('reads the ralph-gate commit status only, ignoring other informational contexts', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
        ],
        getCombinedStatus: async () => ({
          state: 'failure',
          statuses: [
            { context: 'Vercel', state: 'failure' },
            { context: 'ralph-gate', state: 'success' },
          ],
        }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].gateConclusion).toBe('success');
  });

  it('takes the gate verdict from the COMMIT STATUS, not the green engine check run', async () => {
    // Branch protection requires the `ralph-gate` commit status. The engine's
    // Actions job exits 0 even when it sets that status to failure — PR #325
    // (commits 30c4cc4 / 2cc8cc6): check run `ralph-gate / ralph-gate` =
    // success, status `ralph-gate` = failure ("AI review requested changes").
    // Reading the check run would have merged an AI-rejected PR.
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          {
            number: 325,
            head: { repo: HEAD_REPO, ref: 'ralph/issue-298-x', sha: '30c4cc4' },
            labels: [],
          },
        ],
        listCheckRuns: async () => ({
          check_runs: [
            {
              name: 'ralph-gate / ralph-gate',
              status: 'completed',
              conclusion: 'success',
              started_at: '2026-09-16T07:50:00Z',
            },
          ],
        }),
        getCombinedStatus: async () => ({
          state: 'failure',
          statuses: [
            { context: 'ralph-gate', state: 'failure', description: 'AI review requested changes' },
          ],
        }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].gateConclusion).toBe('failure');
    const d = decideWatchdogAction({ ...f, readyIssueCount: 1 });
    expect(d.action).not.toBe(ACTION.MERGE);
  });

  it('maps status states: error is failure, pending or absent is pending', async () => {
    const cases = [
      [[{ context: 'ralph-gate', state: 'success' }], 'success'],
      [[{ context: 'ralph-gate', state: 'failure' }], 'failure'],
      [[{ context: 'ralph-gate', state: 'error' }], 'failure'],
      [[{ context: 'ralph-gate', state: 'pending' }], 'pending'],
      [[{ context: 'Vercel', state: 'success' }], 'pending'],
      [[], 'pending'],
    ];
    for (const [statuses, expected] of cases) {
      const f = await gatherFacts(
        fakePort({
          listOpenPrs: async () => [
            { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
          ],
          getCombinedStatus: async () => ({ statuses }),
        }),
        NOW,
      );
      expect(f.openRalphPrs[0].gateConclusion).toBe(expected);
    }
  });

  it('marks an unreported gate pending and measures its age from the check run', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
        ],
        listCheckRuns: async () => ({
          check_runs: [
            { name: 'ralph-gate', status: 'in_progress', started_at: '2026-09-16T07:30:00Z' },
          ],
        }),
        getCombinedStatus: async () => ({
          statuses: [{ context: 'ralph-gate', state: 'pending' }],
        }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].gateConclusion).toBe('pending');
    expect(f.openRalphPrs[0].gatePendingMinutes).toBe(30);
  });

  it('fails CLOSED on an unreadable issue — never abandons on unknown state', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
        ],
        getIssue: async () => {
          throw new Error('500');
        },
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].issueClosed).toBe(false);
  });

  it('reports only the supervised files from the diff, and reads ralph-approved', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          {
            number: 9,
            head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' },
            labels: [{ name: 'ralph-approved' }],
          },
        ],
        listPrFiles: async () => [
          { filename: 'lib/leads/pipeline.mjs' },
          { filename: 'docs/ai/HANDOFF.md' },
          { filename: 'src/app/pages/ops/pitch/PitchPage.tsx' },
        ],
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].supervisedFiles).toEqual([
      'lib/leads/pipeline.mjs',
      'src/app/pages/ops/pitch/PitchPage.tsx',
    ]);
    expect(f.openRalphPrs[0].prApproved).toBe(true);
  });

  const onePr = async () => [
    { number: 9, head: { repo: HEAD_REPO, ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
  ];
  const docsPage = (page) =>
    Array.from({ length: 100 }, (_, i) => ({ filename: `docs/p${page}-f${i}.md` }));

  it('catches a file renamed OUT of a supervised dir via previous_filename', async () => {
    // GitHub's pulls/{n}/files lists a rename once, under its NEW name, with
    // the old path in `previous_filename`. Checking `filename` alone let a PR
    // move revenue-path code out of lib/leads/ and merge unattended.
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: onePr,
        getCombinedStatus: async () => ({
          statuses: [{ context: 'ralph-gate', state: 'success' }],
        }),
        listPrFiles: async () => [
          {
            filename: 'scripts/pipeline.mjs',
            previous_filename: 'lib/leads/pipeline.mjs',
            status: 'renamed',
          },
        ],
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].supervisedFiles).toEqual(['lib/leads/pipeline.mjs']);
    const d = decideWatchdogAction({ ...f, readyIssueCount: 1 });
    expect(d.action).toBe(ACTION.IDLE);
    expect(d.idleReason).toBe(IDLE_REASON.AWAITING_APPROVAL);
  });

  it('still catches a rename INTO a supervised dir, and names both sides of a same-dir rename', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: onePr,
        listPrFiles: async () => [
          { filename: 'lib/outreach/send.mjs', previous_filename: 'scripts/send.mjs' },
          { filename: 'lib/leads/b.mjs', previous_filename: 'lib/leads/a.mjs' },
          { filename: 'docs/unrelated.md' },
        ],
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].supervisedFiles).toEqual([
      'lib/outreach/send.mjs',
      'lib/leads/b.mjs',
      'lib/leads/a.mjs',
    ]);
  });

  it('paginates past 100 files — a supervised file on page 2 still blocks the merge', async () => {
    const pages = [];
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: onePr,
        listPrFiles: async (n, page) => {
          pages.push([n, page]);
          if (page === 1) return docsPage(1);
          if (page === 2) return [{ filename: 'lib/render/site.mjs' }];
          throw new Error(`unexpected page ${page}`);
        },
      }),
      NOW,
    );
    expect(pages).toEqual([
      [9, 1],
      [9, 2],
    ]);
    expect(f.openRalphPrs[0].supervisedFiles).toEqual(['lib/render/site.mjs']);
    expect(f.openRalphPrs[0].diffUnreadable).toBeNull();
  });

  it('reads a diff of exactly 100 files as complete once page 2 comes back empty', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: onePr,
        listPrFiles: async (n, page) => (page === 1 ? docsPage(1) : []),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].supervisedFiles).toEqual([]);
    expect(f.openRalphPrs[0].diffUnreadable).toBeNull();
  });

  it('fails CLOSED at GitHub’s 3000-file cap, and says so rather than "API error"', async () => {
    const pages = [];
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: onePr,
        listPrFiles: async (n, page) => {
          pages.push(page);
          return docsPage(page);
        },
      }),
      NOW,
    );
    expect(pages).toHaveLength(30); // 30 × 100 = the cap; never asks for page 31
    expect(f.openRalphPrs[0].supervisedFiles).toBeNull();
    expect(f.openRalphPrs[0].diffUnreadable).toBe(DIFF_UNREADABLE.FILE_CAP);
    expect(f.openRalphPrs[0].prApproved).toBe(false);
  });

  it('fails CLOSED on an API error on any page, including after a good first page', async () => {
    for (const listPrFiles of [
      async () => {
        throw new Error('502');
      },
      async (n, page) => {
        if (page === 1) return docsPage(1);
        throw new Error('502');
      },
      async () => ({ message: 'not a list' }),
      async () => [{ status: 'modified' }], // an entry with no filename is unknowable
    ]) {
      const f = await gatherFacts(fakePort({ listOpenPrs: onePr, listPrFiles }), NOW);
      expect(f.openRalphPrs[0].supervisedFiles).toBeNull();
      expect(f.openRalphPrs[0].diffUnreadable).toBe(DIFF_UNREADABLE.API_ERROR);
      expect(f.openRalphPrs[0].prApproved).toBe(false);
    }
  });

  it('detects a run in flight from queued as well as in_progress', async () => {
    for (const status of ['queued', 'in_progress']) {
      const f = await gatherFacts(
        fakePort({ listRuns: async () => ({ workflow_runs: [{ status }] }) }),
        NOW,
      );
      expect(f.runInProgress).toBe(true);
    }
  });
});

describe('applyDecision', () => {
  it('merges with the FULL head sha', async () => {
    const calls = [];
    const port = fakePort({ mergePr: async (n, sha) => calls.push([n, sha]) });
    await applyDecision(port, { action: 'merge', pr: { number: 7, headSha: 'f'.repeat(40) } });
    expect(calls[0]).toEqual([7, 'f'.repeat(40)]);
  });

  it('comments BEFORE closing, so the reason survives on the PR', async () => {
    const order = [];
    const port = fakePort({
      comment: async () => order.push('comment'),
      closePr: async () => order.push('close'),
    });
    await applyDecision(port, { action: 'abandon', pr: { number: 7 }, reason: 'gate red' });
    expect(order).toEqual(['comment', 'close']);
  });

  const SHA = 'd'.repeat(40);
  const awaiting = (over = {}) =>
    decideWatchdogAction({
      openRalphPrs: [
        pr({ number: 42, headSha: SHA, supervisedFiles: ['lib/leads/pipeline.mjs'], ...over }),
      ],
      readyIssueCount: 2,
    });
  const recorder = (over = {}) => {
    const calls = [];
    const port = fakePort({
      addLabels: async (n, labels) => calls.push(['label', n, labels]),
      comment: async (n, body) => calls.push(['comment', n, body]),
      mergePr: async () => calls.push(['merge']),
      closePr: async () => calls.push(['close']),
      dispatch: async () => calls.push(['dispatch']),
      ...over,
    });
    const pages = [];
    const page = async (text) => {
      pages.push(text);
      return { sent: true };
    };
    return { port, calls, pages, page };
  };

  it('asks a human once for a supervised PR: needs-adrian, a comment naming the files, a Discord page', async () => {
    const { port, calls, pages, page } = recorder();
    const performed = await applyDecision(port, awaiting(), { page });
    expect(calls.map((c) => c[0])).toEqual(['label', 'comment']);
    expect(calls[0]).toEqual(['label', 42, [HUMAN_LABEL]]);
    expect(HUMAN_LABEL).toBe('needs-adrian');
    const body = calls[1][2];
    expect(body).toMatch(/lib\/leads\/pipeline\.mjs/);
    expect(body).toMatch(/ralph-approved/);
    expect(body).toContain(SHA); // the dedupe marker carries the FULL head sha
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatch(/\/pull\/42\b/);
    expect(performed).toMatch(/#42/);
  });

  it('does not re-ask on a later tick for the same head SHA', async () => {
    const first = recorder();
    await applyDecision(first.port, awaiting(), { page: first.page });
    const posted = first.calls.find((c) => c[0] === 'comment')[2];

    const { port, calls, pages, page } = recorder({
      listComments: async (n, p) => (p === 1 ? [{ body: 'unrelated' }, { body: posted }] : []),
    });
    const performed = await applyDecision(port, awaiting(), { page });
    expect(calls).toEqual([]);
    expect(pages).toEqual([]);
    expect(performed).toMatch(/already/i);
  });

  it('asks again once the head SHA changes — a new push is a new diff to review', async () => {
    const first = recorder();
    await applyDecision(first.port, awaiting(), { page: first.page });
    const posted = first.calls.find((c) => c[0] === 'comment')[2];

    const { port, calls } = recorder({
      listComments: async (n, p) => (p === 1 ? [{ body: posted }] : []),
    });
    await applyDecision(port, awaiting({ headSha: 'e'.repeat(40) }), { page: async () => ({}) });
    expect(calls.map((c) => c[0])).toEqual(['label', 'comment']);
  });

  it('reads every page of comments before deciding it has not asked yet', async () => {
    const first = recorder();
    await applyDecision(first.port, awaiting(), { page: first.page });
    const posted = first.calls.find((c) => c[0] === 'comment')[2];
    const filler = Array.from({ length: 100 }, (_, i) => ({ body: `c${i}` }));

    const seenPages = [];
    const { port, calls } = recorder({
      listComments: async (n, p) => {
        seenPages.push(p);
        return p === 1 ? filler : p === 2 ? [{ body: posted }] : [];
      },
    });
    await applyDecision(port, awaiting(), { page: async () => ({ sent: true }) });
    expect(seenPages).toEqual([1, 2]);
    expect(calls).toEqual([]);
  });

  it('still lands the label and comment when Discord is not configured, and says how to fix it', async () => {
    const { port, calls } = recorder();
    const performed = await applyDecision(port, awaiting(), {
      page: async () => ({ sent: false, reason: 'DISCORD_WEBHOOK_URL is not set' }),
    });
    expect(calls.map((c) => c[0])).toEqual(['label', 'comment']);
    expect(performed).toMatch(/DISCORD_WEBHOOK_URL/);
  });

  it('never pings for a transient diff-read error, or any other idle', async () => {
    const { port, calls, pages, page } = recorder();
    for (const d of [
      awaiting({ supervisedFiles: null, diffUnreadable: DIFF_UNREADABLE.API_ERROR }),
      decideWatchdogAction({ openRalphPrs: [], readyIssueCount: 0 }),
      decideWatchdogAction({ openRalphPrs: [pr({ gateConclusion: 'pending' })] }),
    ]) {
      await applyDecision(port, d, { page });
    }
    expect(calls).toEqual([]);
    expect(pages).toEqual([]);
  });

  it('never auto-acts on fix or resolve-conflict — those need a reader', async () => {
    let touched = false;
    const port = fakePort({
      mergePr: async () => (touched = true),
      closePr: async () => (touched = true),
      dispatch: async () => (touched = true),
    });
    for (const action of ['fix', 'resolve-conflict']) {
      await applyDecision(port, { action, pr: { number: 7 } });
    }
    expect(touched).toBe(false);
  });
});

describe('makeGitHubPort endpoints', () => {
  const recordingPort = () => {
    const urls = [];
    const port = makeGitHubPort({
      token: 't',
      fetchImpl: async (url) => {
        urls.push(url);
        return { status: 200, ok: true, json: async () => [] };
      },
    });
    return { port, urls };
  };

  it('requests one explicit page of PR files at a time', async () => {
    const { port, urls } = recordingPort();
    await port.listPrFiles(42, 3);
    expect(urls[0]).toMatch(/\/pulls\/42\/files\?per_page=100&page=3$/);
  });

  it('reads mergeability from the single-PR endpoint', async () => {
    const { port, urls } = recordingPort();
    await port.getPr(42);
    expect(urls[0]).toMatch(/\/pulls\/42$/);
  });

  it('pages PR comments one explicit page at a time', async () => {
    const { port, urls } = recordingPort();
    await port.listComments(42, 2);
    expect(urls[0]).toMatch(/\/issues\/42\/comments\?per_page=100&page=2$/);
  });

  it('adds labels through the issues labels endpoint', async () => {
    const seen = [];
    const port = makeGitHubPort({
      token: 't',
      fetchImpl: async (url, init) => {
        seen.push([url, init.method, init.body]);
        return { status: 200, ok: true, json: async () => [] };
      },
    });
    await port.addLabels(42, ['needs-adrian']);
    expect(seen[0][0]).toMatch(/\/issues\/42\/labels$/);
    expect(seen[0][1]).toBe('POST');
    expect(JSON.parse(seen[0][2])).toEqual({ labels: ['needs-adrian'] });
  });

  it('reads the gate verdict from the combined commit status endpoint', async () => {
    const { port, urls } = recordingPort();
    await port.getCombinedStatus('f'.repeat(40));
    expect(urls[0]).toMatch(new RegExp(`/commits/${'f'.repeat(40)}/status\\?per_page=100$`));
  });
});

describe('buildReport (--json output)', () => {
  const facts = { openRalphPrs: [pr()], readyIssueCount: 2, runInProgress: false };

  it('carries idleReason, plus supervisedFiles and prApproved for the acted-on PR', () => {
    const decision = decideWatchdogAction({
      ...facts,
      openRalphPrs: [pr({ supervisedFiles: ['lib/leads/pipeline.mjs'] })],
    });
    const out = buildReport({ decision, facts, apply: true, performed: null });
    expect(out).toMatchObject({
      ok: true,
      dryRun: false,
      action: ACTION.IDLE,
      idleReason: IDLE_REASON.AWAITING_APPROVAL,
      pr: 100,
      supervisedFiles: ['lib/leads/pipeline.mjs'],
      prApproved: false,
      diffUnreadable: null,
    });
  });

  it('reports an unreadable diff as null files with its cause', () => {
    const decision = decideWatchdogAction({
      ...facts,
      openRalphPrs: [pr({ supervisedFiles: null, diffUnreadable: DIFF_UNREADABLE.FILE_CAP })],
    });
    const out = buildReport({ decision, facts, apply: false, performed: null });
    expect(out.supervisedFiles).toBeNull();
    expect(out.diffUnreadable).toBe(DIFF_UNREADABLE.FILE_CAP);
    expect(out.prApproved).toBe(false);
  });

  it('reports a merge with prApproved and idleReason null', () => {
    const decision = decideWatchdogAction({
      ...facts,
      openRalphPrs: [pr({ supervisedFiles: ['lib/agent/llm.mjs'], prApproved: true })],
    });
    const out = buildReport({ decision, facts, apply: true, performed: 'merged PR #100' });
    expect(out).toMatchObject({
      action: ACTION.MERGE,
      idleReason: null,
      supervisedFiles: ['lib/agent/llm.mjs'],
      prApproved: true,
      performed: 'merged PR #100',
    });
  });

  it('uses null PR fields when no PR is acted on', () => {
    const noPr = { openRalphPrs: [], readyIssueCount: 0, runInProgress: false };
    const out = buildReport({
      decision: decideWatchdogAction(noPr),
      facts: noPr,
      apply: false,
      performed: null,
    });
    expect(out).toMatchObject({
      idleReason: IDLE_REASON.QUEUE_EMPTY,
      pr: null,
      supervisedFiles: null,
      prApproved: null,
      diffUnreadable: null,
      facts: { openRalphPrs: [], readyIssueCount: 0, runInProgress: false },
    });
  });
});

describe('the Actions job token can read everything gatherFacts reads', () => {
  it('ralph-watchdog.yml grants statuses and checks, not just the four write scopes', () => {
    // A job-level `permissions:` block sets every unlisted permission to none.
    // Without these, the first tick that finds an open ralph/* PR 403s reading
    // the ralph-gate commit status (and the check run that dates it).
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const yml = readFileSync(join(root, '.github', 'workflows', 'ralph-watchdog.yml'), 'utf8');
    expect(yml).toMatch(/^\s+statuses:\s*(read|write)\b/m);
    expect(yml).toMatch(/^\s+checks:\s*(read|write)\b/m);
  });

  it('ralph-watchdog.yml hands the job the Discord webhook, so an awaiting-approval wedge pages', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const yml = readFileSync(join(root, '.github', 'workflows', 'ralph-watchdog.yml'), 'utf8');
    expect(yml).toMatch(/DISCORD_WEBHOOK_URL:\s*\$\{\{\s*secrets\.DISCORD_WEBHOOK_URL\s*\}\}/);
  });
});

describe('auth failure is loud and actionable', () => {
  it('names the variable AND the fix on a 401', async () => {
    const port = makeGitHubPort({
      token: 'bad',
      fetchImpl: async () => ({ status: 401, ok: false }),
    });
    await expect(port.listOpenPrs()).rejects.toThrow(/GITHUB_TOKEN.*GH_TOKEN/s);
    await expect(port.listOpenPrs()).rejects.toThrow(/personal-access-tokens/);
    // The gate verdict is a commit status: a token without that read 403s.
    await expect(port.listOpenPrs()).rejects.toThrow(/commit statuses/i);
  });

  it('treats 403 as an auth failure too, not a generic error', async () => {
    const port = makeGitHubPort({
      token: 'bad',
      fetchImpl: async () => ({ status: 403, ok: false }),
    });
    await expect(port.listOpenPrs()).rejects.toMatchObject({ authFailure: true });
  });
});
