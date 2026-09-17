/**
 * lib/tasks/severity.mjs — the sev axis (ops#317), orthogonal to p0–p3.
 *
 * The contract these lock down: severity is read from labels alone, the most
 * severe label wins when an issue carries several, and "open sev1" means open
 * AND sev1 — a closed sev1 is history, not a fire.
 */
import { describe, it, expect } from 'vitest';
import { SEVERITY_LADDER, openSev1, severityOf } from '../../lib/tasks/severity.mjs';

function issue(over: Record<string, unknown>) {
  return {
    repo: 'hirobius/ops',
    number: 1,
    title: 'an issue',
    url: 'https://github.com/hirobius/ops/issues/1',
    state: 'open',
    labels: [] as unknown[],
    ...over,
  };
}

describe('SEVERITY_LADDER', () => {
  // These strings are the GitHub label descriptions in ops AND hds. If one
  // changes here, the labels have to be edited to match (issue #317's table).
  it('carries the three rungs, most severe first, with the #317 descriptions', () => {
    expect(SEVERITY_LADDER.map((r: { label: string }) => r.label)).toEqual([
      'sev1',
      'sev2',
      'sev3',
    ]);
    expect(SEVERITY_LADDER[0].means).toBe(
      'Legal exposure, security incident, data loss, or already affecting a real third party',
    );
    expect(SEVERITY_LADDER[1].means).toBe(
      'Could become sev1; degrades a production surface; breaks a trust signal',
    );
    expect(SEVERITY_LADDER[2].means).toBe('Contained blast radius');
  });

  // GitHub rejects a label description over 100 characters.
  it('keeps every description inside GitHub’s 100-character label limit', () => {
    for (const rung of SEVERITY_LADDER) expect(rung.means.length).toBeLessThanOrEqual(100);
  });
});

describe('severityOf', () => {
  it('returns null when no sev label is present', () => {
    expect(severityOf(issue({ labels: ['p1', 'backlog'] }))).toBeNull();
  });

  it('reads each rung', () => {
    expect(severityOf(issue({ labels: ['sev1'] }))).toBe('sev1');
    expect(severityOf(issue({ labels: ['sev2'] }))).toBe('sev2');
    expect(severityOf(issue({ labels: ['sev3'] }))).toBe('sev3');
  });

  it('picks the most severe label when several are present', () => {
    expect(severityOf(issue({ labels: ['sev3', 'sev1', 'sev2'] }))).toBe('sev1');
  });

  // `gh search issues --json labels` returns objects, the GitHub port returns
  // strings — one reader for both so the gate and the page cannot disagree.
  it('accepts label objects as well as strings', () => {
    expect(severityOf(issue({ labels: [{ name: 'p1' }, { name: 'sev1' }] }))).toBe('sev1');
  });

  it('ignores a look-alike label', () => {
    expect(severityOf(issue({ labels: ['sev10', 'severity', 'sev0'] }))).toBeNull();
  });

  it('survives a missing labels array rather than throwing', () => {
    expect(severityOf({})).toBeNull();
  });
});

describe('openSev1', () => {
  it('keeps only open issues carrying sev1', () => {
    const out = openSev1([
      issue({ number: 27, labels: ['sev1', 'p1'] }),
      issue({ number: 35, labels: ['sev2'] }),
      issue({ number: 99, labels: ['sev1'], state: 'closed' }),
      issue({ number: 5, labels: [] }),
    ]);
    expect(out.map((i: { number: number }) => i.number)).toEqual([27]);
  });

  it('treats GitHub’s upper-case OPEN as open', () => {
    expect(openSev1([issue({ labels: ['sev1'], state: 'OPEN' })])).toHaveLength(1);
  });

  // The fleet feed only ever returns open issues and may omit `state`.
  it('treats an issue with no state as open', () => {
    const noState = Object.fromEntries(
      Object.entries(issue({ labels: ['sev1'] })).filter(([k]) => k !== 'state'),
    );
    expect(noState).not.toHaveProperty('state');
    expect(openSev1([noState])).toHaveLength(1);
  });

  it('returns a normalized row and orders by repo, then number', () => {
    const out = openSev1([
      issue({ repo: 'hirobius/ops', number: 40, title: 'b', labels: ['sev1'] }),
      issue({ repo: 'hirobius/hds', number: 90, title: 'c', labels: ['sev1'] }),
      issue({ repo: 'hirobius/ops', number: 27, title: 'a', labels: [{ name: 'sev1' }] }),
    ]);
    expect(out).toEqual([
      {
        repo: 'hirobius/hds',
        number: 90,
        title: 'c',
        url: 'https://github.com/hirobius/ops/issues/1',
      },
      {
        repo: 'hirobius/ops',
        number: 27,
        title: 'a',
        url: 'https://github.com/hirobius/ops/issues/1',
      },
      {
        repo: 'hirobius/ops',
        number: 40,
        title: 'b',
        url: 'https://github.com/hirobius/ops/issues/1',
      },
    ]);
  });

  it('returns nothing for a non-array', () => {
    expect(openSev1(undefined)).toEqual([]);
  });
});
