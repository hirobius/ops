import { describe, it, expect } from 'vitest';
import {
  decideWatchdogAction,
  isMutating,
  ACTION,
  IDLE_REASON,
  GATE_PENDING_STALE_MINUTES,
} from '../../lib/ops/ralph-watchdog.mjs';

const pr = (over = {}) => ({
  number: 100,
  headRef: 'ralph/issue-330-telemetry',
  gateConclusion: 'success',
  mergeableState: 'clean',
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
import { gatherFacts, applyDecision, makeGitHubPort } from '../ralph-watchdog.mjs';

const NOW = Date.parse('2026-09-16T08:00:00Z');

const fakePort = (over = {}) => ({
  listOpenPrs: async () => [],
  listReadyIssues: async () => [],
  listRuns: async () => ({ workflow_runs: [] }),
  listCheckRuns: async () => ({ check_runs: [] }),
  getIssue: async () => ({ state: 'open' }),
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

  it('reads ralph-gate only, ignoring other informational checks', async () => {
    const f = await gatherFacts(
      fakePort({
        listOpenPrs: async () => [
          { number: 9, head: { ref: 'ralph/issue-9-x', sha: 's' }, labels: [] },
        ],
        listCheckRuns: async () => ({
          check_runs: [
            { name: 'Lighthouse CI', status: 'completed', conclusion: 'failure' },
            { name: 'ralph-gate / ralph-gate', status: 'completed', conclusion: 'success' },
          ],
        }),
      }),
      NOW,
    );
    expect(f.openRalphPrs[0].gateConclusion).toBe('success');
  });

  it('marks an incomplete gate pending and measures its age', async () => {
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

describe('auth failure is loud and actionable', () => {
  it('names the variable AND the fix on a 401', async () => {
    const port = makeGitHubPort({
      token: 'bad',
      fetchImpl: async () => ({ status: 401, ok: false }),
    });
    await expect(port.listOpenPrs()).rejects.toThrow(/GITHUB_TOKEN.*GH_TOKEN/s);
    await expect(port.listOpenPrs()).rejects.toThrow(/personal-access-tokens/);
  });

  it('treats 403 as an auth failure too, not a generic error', async () => {
    const port = makeGitHubPort({
      token: 'bad',
      fetchImpl: async () => ({ status: 403, ok: false }),
    });
    await expect(port.listOpenPrs()).rejects.toMatchObject({ authFailure: true });
  });
});
