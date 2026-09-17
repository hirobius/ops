/**
 * lib/pii/range.mjs — which changes the CI PII scan covers for a GitHub event,
 * and how a local `--range` spec is read. Same range policy as the secret scan
 * (ops#32): only what the PR or push adds, never full history, so one historic
 * finding cannot turn every PR red.
 */
import { describe, it, expect } from 'vitest';
import { resolveEventRange, parseRangeSpec, EMPTY_TREE } from '../../lib/pii/range.mjs';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const present = () => true;
const withParent = () => true;

describe('resolveEventRange', () => {
  it('scans what a pull request adds on top of its base', () => {
    expect(
      resolveEventRange({
        eventName: 'pull_request',
        payload: { pull_request: { base: { sha: BASE }, head: { sha: HEAD } } },
        commitExists: present,
        hasParent: withParent,
      }),
    ).toEqual({ diffArgs: [`${BASE}...${HEAD}`], logArgs: [`${BASE}..${HEAD}`] });
  });

  it('scans what a push to main adds on top of the previous tip', () => {
    expect(
      resolveEventRange({
        eventName: 'push',
        payload: { before: BASE, after: HEAD },
        commitExists: present,
        hasParent: withParent,
      }),
    ).toEqual({ diffArgs: [`${BASE}...${HEAD}`], logArgs: [`${BASE}..${HEAD}`] });
  });

  it('falls back to the pushed tip commit, with a warning, when there is no usable previous tip', () => {
    const zero = resolveEventRange({
      eventName: 'push',
      payload: { before: '0'.repeat(40), after: HEAD },
      commitExists: present,
      hasParent: withParent,
    });
    expect(zero.diffArgs).toEqual([`${HEAD}^1`, HEAD]);
    expect(zero.logArgs).toEqual(['-1', HEAD]);
    expect(zero.warning).toMatch(/only the pushed tip/i);

    const rewritten = resolveEventRange({
      eventName: 'push',
      payload: { before: BASE, after: HEAD },
      commitExists: (sha) => sha !== BASE,
      hasParent: () => false,
    });
    expect(rewritten.diffArgs).toEqual([EMPTY_TREE, HEAD]);
  });

  it('fails loud, naming fetch-depth, when a needed commit is missing from a shallow clone', () => {
    expect(() =>
      resolveEventRange({
        eventName: 'pull_request',
        payload: { pull_request: { base: { sha: BASE }, head: { sha: HEAD } } },
        commitExists: (sha) => sha !== BASE,
        hasParent: withParent,
      }),
    ).toThrow(/fetch-depth: 0/);
  });

  it('refuses anything that is not a full commit SHA', () => {
    expect(() =>
      resolveEventRange({
        eventName: 'push',
        payload: { before: '--output=/tmp/x', after: HEAD },
        commitExists: present,
        hasParent: withParent,
      }),
    ).toThrow(/not a 40-character commit SHA/);
  });

  it('fails loud on an event it has no rule for', () => {
    expect(() =>
      resolveEventRange({
        eventName: 'schedule',
        payload: {},
        commitExists: present,
        hasParent: withParent,
      }),
    ).toThrow(/no PII scan range rule for the "schedule" event/);
  });
});

describe('parseRangeSpec', () => {
  it('reads A..B as "what B adds since it forked from A"', () => {
    expect(parseRangeSpec('origin/main..HEAD')).toEqual({
      diffArgs: ['origin/main...HEAD'],
      logArgs: ['origin/main..HEAD'],
    });
  });

  it('rejects specs that are not two refs, or that could be read as git options', () => {
    expect(() => parseRangeSpec('HEAD')).toThrow(/A\.\.B/);
    expect(() => parseRangeSpec('--output=x..HEAD')).toThrow(/not a git ref/);
    expect(() => parseRangeSpec('main..HEAD --stat')).toThrow(/not a git ref/);
  });
});
