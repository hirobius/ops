/**
 * lib/ops/branch-ancestry.mjs — is this branch still based on origin/main?
 *
 * The rule this encodes is counter-intuitive and the obvious version is WRONG.
 * `git merge-base --is-ancestor HEAD origin/main` returns FALSE for a perfectly
 * healthy in-progress branch, so a gate built on it fires on every feature
 * branch with unpushed work. The correct question is the reverse: is
 * origin/main an ancestor of HEAD — i.e. is my branch built on current main?
 *
 * The case that matters: this repo squash-merges, so the moment a PR lands the
 * source branch stops being an ancestor of main AND main stops being an
 * ancestor of it. Committing there builds a fork that carries phantom diffs
 * reverting whatever else landed in between. That happened three times in one
 * session on 2026-09-15/16.
 */
import { describe, it, expect } from 'vitest';
import { evaluateBranch, SKIP, OK, BEHIND, DIVERGED } from '../../lib/ops/branch-ancestry.mjs';

const healthy = {
  branch: 'claude/feature-x',
  detached: false,
  mainRefKnown: true,
  mainIsAncestorOfHead: true,
  headIsAncestorOfMain: false,
};

describe('evaluateBranch — the healthy cases must NOT fire', () => {
  it('passes a branch with new commits on top of current main', () => {
    expect(evaluateBranch(healthy).status).toBe(OK);
  });

  // This is the exact false positive that killed the naive one-liner: a branch
  // sitting exactly at main is healthy, and so is one with work on top.
  it('passes a branch sitting exactly at main (both directions true)', () => {
    expect(
      evaluateBranch({ ...healthy, mainIsAncestorOfHead: true, headIsAncestorOfMain: true }).status,
    ).toBe(OK);
  });
});

describe('evaluateBranch — the case this gate exists for', () => {
  it('flags a branch that diverged from main in both directions', () => {
    const r = evaluateBranch({
      ...healthy,
      mainIsAncestorOfHead: false,
      headIsAncestorOfMain: false,
    });
    expect(r.status).toBe(DIVERGED);
  });

  // A session that only hears "your branch is stale" will merge main in and
  // keep a dead pointer. A session that only hears "reset" will destroy real
  // unmerged work. The message has to carry both, because the gate cannot tell
  // which one from ancestry alone.
  it('names BOTH remedies, because ancestry alone cannot pick one', () => {
    const r = evaluateBranch({
      ...healthy,
      mainIsAncestorOfHead: false,
      headIsAncestorOfMain: false,
    });
    expect(r.message).toMatch(/squash/i);
    expect(r.message).toMatch(/checkout -B/);
    expect(r.message).toMatch(/merge origin\/main/);
  });

  it('flags a branch strictly behind main separately from a diverged one', () => {
    const r = evaluateBranch({
      ...healthy,
      mainIsAncestorOfHead: false,
      headIsAncestorOfMain: true,
    });
    expect(r.status).toBe(BEHIND);
  });

  // #304: a warn-severity finding that hard-fails can brick every commit in the
  // repo. Nothing this gate reports is ever allowed to block.
  it('never reports a blocking severity', () => {
    for (const s of [
      { mainIsAncestorOfHead: false, headIsAncestorOfMain: false },
      { mainIsAncestorOfHead: false, headIsAncestorOfMain: true },
    ]) {
      expect(evaluateBranch({ ...healthy, ...s }).severity).toBe('warn');
    }
  });
});

describe('evaluateBranch — skips, so it cannot fire where it has no opinion', () => {
  it('skips on main itself', () => {
    expect(evaluateBranch({ ...healthy, branch: 'main' }).status).toBe(SKIP);
  });

  it('skips on detached HEAD', () => {
    expect(evaluateBranch({ ...healthy, detached: true }).status).toBe(SKIP);
  });

  // A fresh clone, or a repo whose origin/main was never fetched, knows nothing
  // about main. Guessing there would fire on every commit in a new checkout.
  it('skips when origin/main is not known locally', () => {
    const r = evaluateBranch({
      ...healthy,
      mainRefKnown: false,
      mainIsAncestorOfHead: false,
      headIsAncestorOfMain: false,
    });
    expect(r.status).toBe(SKIP);
  });

  it('skips rather than throwing on a missing state object', () => {
    expect(evaluateBranch(undefined).status).toBe(SKIP);
    expect(evaluateBranch({}).status).toBe(SKIP);
  });
});

describe('evaluateBranch — the message tells the truth about staleness', () => {
  // The gate reads the locally-known origin/main and deliberately does not
  // fetch: a hook that hits the network is slow and breaks offline. That makes
  // a false positive possible after someone else pushes, so the message says so.
  it('says the comparison is against the last-fetched main', () => {
    const r = evaluateBranch({
      ...healthy,
      mainIsAncestorOfHead: false,
      headIsAncestorOfMain: false,
    });
    expect(r.message).toMatch(/fetch/i);
  });
});
