/**
 * IssueActions — the per-row controls on /ops/standing (ops#367).
 *
 * Two of them act on the loop rather than on a label, so each carries a guard:
 *
 *   - `run` dispatches ralph.yml at one issue. An explicit issue overrides the
 *     single-flight guard and steals any claim, so it is offered only on a row
 *     in the queue lane that no iteration holds, asks first, and stays disabled
 *     once it has fired.
 *   - arming `auto` lets a green PR merge with no supervised-path check
 *     (ops#238), so arming asks first and names that. Disarming stays one tap.
 *
 * @testing-library/react is not installed; tests use act + createRoot directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FleetIssue } from '../ralphStatus';
import { IssueActions } from './StandingPage';

const QUEUED: FleetIssue = {
  repo: 'hirobius/ops',
  number: 44,
  title: 'wire the thing',
  url: 'https://github.com/hirobius/ops/issues/44',
  label: null,
  prio: 'p1',
  ageDays: 3,
  quietDays: 1,
  labels: ['ralph-ready', 'p1'],
  comments: 0,
  assignee: null,
  hasDod: true,
  excerpt: '',
  queued: true,
  auto: false,
  wip: false,
};

const ID = `${QUEUED.repo}#${QUEUED.number}`;
const NONE: ReadonlySet<string> = new Set();

describe('IssueActions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  function render(issue: FleetIssue, dispatched: ReadonlySet<string> = NONE) {
    const act_ = vi.fn();
    act(() =>
      root.render(
        <IssueActions
          id={`${issue.repo}#${issue.number}`}
          issue={issue}
          busy={NONE}
          dispatched={dispatched}
          act={act_}
        />,
      ),
    );
    return act_;
  }

  const runButton = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label^="Run the loop on"]');
  const autoButton = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label*="auto-merge"]');

  // ── run ──────────────────────────────────────────────────────────────────

  it('offers run on a queued row that no iteration holds', () => {
    render(QUEUED);
    expect(runButton()).not.toBeNull();
  });

  it.each([
    ['is not queued', { ...QUEUED, queued: false, labels: ['p1'] }],
    ['already carries ralph-wip', { ...QUEUED, wip: true }],
    [
      'is human-gated, even with ralph-ready',
      { ...QUEUED, label: 'needs-adrian', labels: ['needs-adrian', 'ralph-ready'] },
    ],
    [
      'is parked, even with ralph-ready',
      { ...QUEUED, label: 'ralph-parked', labels: ['ralph-parked', 'ralph-ready'] },
    ],
  ])('does not offer run when the row %s', (_why, issue) => {
    render(issue);
    expect(runButton()).toBeNull();
  });

  it('asks before dispatching, and dispatches nothing when the answer is no', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onAct = render(QUEUED);
    act(() => runButton()!.click());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/ops#44/);
    expect(onAct).not.toHaveBeenCalled();
  });

  it('dispatches run_now once confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onAct = render(QUEUED);
    act(() => runButton()!.click());
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onAct.mock.calls[0].slice(0, 3)).toEqual(['hirobius/ops', 44, 'run_now']);
  });

  it('stays disabled once this row has been dispatched', () => {
    render(QUEUED, new Set([ID]));
    expect(runButton()?.disabled).toBe(true);
  });

  // ── auto ─────────────────────────────────────────────────────────────────

  it('asks before arming auto-merge, naming ops#238, and arms nothing on no', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onAct = render(QUEUED);
    act(() => autoButton()!.click());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/ops#238/);
    expect(confirm.mock.calls[0][0]).toMatch(/supervised-path/);
    expect(onAct).not.toHaveBeenCalled();
  });

  it('arms auto-merge once confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onAct = render(QUEUED);
    act(() => autoButton()!.click());
    expect(onAct.mock.calls[0].slice(0, 3)).toEqual(['hirobius/ops', 44, 'auto_on_direct']);
  });

  it('disarms auto-merge in one tap, without asking', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onAct = render({ ...QUEUED, auto: true, labels: [...QUEUED.labels, 'ralph-auto'] });
    act(() => autoButton()!.click());
    expect(confirm).not.toHaveBeenCalled();
    expect(onAct.mock.calls[0].slice(0, 3)).toEqual(['hirobius/ops', 44, 'auto_off_direct']);
  });
});
