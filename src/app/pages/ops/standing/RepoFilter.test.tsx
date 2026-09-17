/**
 * RepoFilter — the chip row that scopes Standing's lanes to one repo.
 *
 * Tested through what an operator (or a screen reader) meets: a labelled group
 * of pressable chips, each naming its repo and open count, and a visible note
 * when the link named a repo the data does not hold.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RepoFilter } from './RepoFilter';
import type { RepoOption } from './repoScope';

const OPTIONS: RepoOption[] = [
  { repo: 'hirobius/job-hunt', param: 'job-hunt', issues: 32, prs: 0, count: 32 },
  { repo: 'hirobius/ops', param: 'ops', issues: 28, prs: 2, count: 30 },
  { repo: 'hirobius/lilac', param: 'lilac', issues: 26, prs: 0, count: 26 },
];

afterEach(cleanup);

function chips() {
  const group = screen.getByRole('group', { name: 'Filter lanes by repo' });
  return within(group).getAllByRole('button');
}

describe('RepoFilter', () => {
  it('offers All repos first, then each repo in the given order, with open counts', () => {
    render(<RepoFilter options={OPTIONS} selected={null} unknown={null} onSelect={vi.fn()} />);

    expect(chips().map((c) => c.textContent)).toEqual([
      'All repos88',
      'job-hunt32',
      'ops30',
      'lilac26',
    ]);
  });

  it('names what each count is made of for assistive tech, leading with the visible text', () => {
    render(<RepoFilter options={OPTIONS} selected={null} unknown={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'ops 30 open — 28 issues, 2 PRs' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All repos 88 open' })).toBeTruthy();
  });

  it('marks exactly the selected chip as pressed', () => {
    render(
      <RepoFilter options={OPTIONS} selected="hirobius/ops" unknown={null} onSelect={vi.fn()} />,
    );

    const pressed = chips().filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((c) => c.textContent)).toEqual(['ops30']);
  });

  it('presses All repos when nothing is selected', () => {
    render(<RepoFilter options={OPTIONS} selected={null} unknown={null} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^All repos/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('reports the chosen param, or null for All repos', () => {
    const onSelect = vi.fn();
    render(
      <RepoFilter options={OPTIONS} selected="hirobius/ops" unknown={null} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^lilac/ }));
    fireEvent.click(screen.getByRole('button', { name: /^All repos/ }));

    expect(onSelect.mock.calls).toEqual([['lilac'], [null]]);
  });

  it('does not re-report the chip that is already selected', () => {
    const onSelect = vi.fn();
    render(
      <RepoFilter options={OPTIONS} selected="hirobius/ops" unknown={null} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^ops/ }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('says out loud when the link named a repo it does not hold', () => {
    render(
      <RepoFilter options={OPTIONS} selected={null} unknown="portal-kit" onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('status').textContent).toBe(
      'Nothing open in “portal-kit” — showing all repos.',
    );
  });

  it('offers no chips when no repo has anything open, but still explains a dead link', () => {
    render(<RepoFilter options={[]} selected={null} unknown="ops" onSelect={vi.fn()} />);

    expect(screen.queryByRole('group', { name: 'Filter lanes by repo' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Nothing open in “ops” — showing all repos.',
    );
  });

  it('gives every chip the 44px interactive minimum as its touch target', () => {
    render(<RepoFilter options={OPTIONS} selected={null} unknown={null} onSelect={vi.fn()} />);

    for (const chip of chips()) {
      expect(chip.style.minHeight).toBe('var(--primitive-size-interactive-min)');
    }
  });
});
