/**
 * Contract test: Tag
 * Verifies that Tag emits the expected BEM class names and data attributes
 * for active/inactive states.
 *
 * @primitive Tag
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Tag } from '@/app/components/tag';

describe('Tag contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Tag>Label</Tag>);
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('root element is a button', () => {
    const { container } = render(<Tag>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });

  it('root button carries hds-tag-btn class', () => {
    const { container } = render(<Tag>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.classList.contains('hds-tag-btn')).toBe(true);
  });

  it('inner pill carries hds-tag-pill class', () => {
    const { container } = render(<Tag>Label</Tag>);
    const pill = container.querySelector('.hds-tag-pill');
    expect(pill).not.toBeNull();
  });

  it('active=false sets aria-pressed="false"', () => {
    const { container } = render(<Tag active={false}>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('active=true sets aria-pressed="true"', () => {
    const { container } = render(<Tag active={true}>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('active=true sets data-active="true"', () => {
    const { container } = render(<Tag active={true}>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('data-active')).toBe('true');
  });

  it('active=false does not set data-active', () => {
    const { container } = render(<Tag active={false}>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('data-active')).toBeNull();
  });

  it('ariaLabel prop sets aria-label on the button', () => {
    const { container } = render(<Tag ariaLabel="Filter by React">React</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.getAttribute('aria-label')).toBe('Filter by React');
  });

  it('hds-focus class is applied to the button', () => {
    const { container } = render(<Tag>Label</Tag>);
    const btn = container.querySelector('button');
    expect(btn?.classList.contains('hds-focus')).toBe(true);
  });
});
