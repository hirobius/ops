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
import { gatherFacts, applyDecision, makeGitHubPort, buildReport } from '../ralph-watchdog.mjs';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const fakePort = (over = {}) => ({
  listOpenPrs: async () => [],
  listReadyIssues: async () => [],
  listRuns: async () => ({ workflow_runs: [] }),
  listCheckRuns: async () => ({ check_runs: [] }),
  getCombinedStatus: async () => ({ state: 'pending', statuses: [] }),
  getIssue: async () => ({ state: 'open' }),
  listPrFiles: async () => [],
  ...over,
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
          { number: 9, head: { ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
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
          { number: 325, head: { ref: 'ralph/issue-298-x', sha: '30c4cc4' }, labels: [] },
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
            { number: 9, head: { ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
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
          { number: 9, head: { ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
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
          { number: 9, head: { ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
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
            head: { ref: 'ralph/issue-9-x', sha: 's' },
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

  const onePr = async () => [{ number: 9, head: { ref: 'ralph/issue-9-x', sha: 's' }, labels: [] }];
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
