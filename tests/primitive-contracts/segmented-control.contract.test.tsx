/**
 * Contract test: SegmentedControl
 * Verifies that SegmentedControl renders the correct role, button count,
 * and aria-pressed state for the selected option.
 *
 * @primitive SegmentedControl
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SegmentedControl } from '@/app/components/segmented-control';

const OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
  { value: 'c', label: 'Option C' },
];

describe('SegmentedControl contract', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders a button for each option', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(OPTIONS.length);
  });

  it('active option button has aria-pressed="true"', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="b" onChange={() => {}} />
    );
    const buttons = container.querySelectorAll('button');
    const activeBtn = Array.from(buttons).find(b => b.textContent?.includes('Option B'));
    expect(activeBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('inactive option buttons have aria-pressed="false"', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />
    );
    const buttons = container.querySelectorAll('button');
    const inactiveButtons = Array.from(buttons).filter(b => !b.textContent?.includes('Option A'));
    inactiveButtons.forEach(btn => {
      expect(btn.getAttribute('aria-pressed')).toBe('false');
    });
  });

  it('renders a group role container', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} ariaLabel="View mode" />
    );
    const group = container.querySelector('[role="group"]');
    expect(group).not.toBeNull();
  });

  it('ariaLabel is applied to the group', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} ariaLabel="View mode" />
    );
    const group = container.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toBe('View mode');
  });

  it('label prop renders visible label text', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} label="Sort by" />
    );
    expect(container.textContent).toContain('Sort by');
  });

  it('hds-focus class is applied to each button', () => {
    const { container } = render(
      <SegmentedControl options={OPTIONS} value="a" onChange={() => {}} />
    );
    const buttons = container.querySelectorAll('button');
    buttons.forEach(btn => {
      expect(btn.classList.contains('hds-focus')).toBe(true);
    });
  });
});
