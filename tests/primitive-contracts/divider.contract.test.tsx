/**
 * Contract test: Divider
 * Verifies that orientation and strong props produce the expected inline style
 * and aria attributes.
 *
 * @primitive Divider
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Divider } from '@/app/components/divider';

describe('Divider contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Divider />);
    expect(container.querySelector('hr')).not.toBeNull();
  });

  it('renders an <hr> element', () => {
    const { container } = render(<Divider />);
    const el = container.querySelector('hr');
    expect(el?.tagName.toLowerCase()).toBe('hr');
  });

  it('horizontal orientation sets aria-orientation="horizontal"', () => {
    const { container } = render(<Divider orientation="horizontal" />);
    const el = container.querySelector('hr');
    expect(el?.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('vertical orientation sets aria-orientation="vertical"', () => {
    const { container } = render(<Divider orientation="vertical" />);
    const el = container.querySelector('hr');
    expect(el?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('default orientation is horizontal', () => {
    const { container } = render(<Divider />);
    const el = container.querySelector('hr');
    expect(el?.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('strong=false uses default border token', () => {
    const { container } = render(<Divider strong={false} />);
    const el = container.querySelector('hr') as HTMLElement;
    expect(el?.style.borderTop).toContain('semantic-color-border-default');
  });

  it('strong=true uses strong border token', () => {
    const { container } = render(<Divider strong={true} />);
    const el = container.querySelector('hr') as HTMLElement;
    expect(el?.style.borderTop).toContain('semantic-color-border-strong');
  });

  it('className prop is applied to the hr element', () => {
    const { container } = render(<Divider className="my-divider" />);
    const el = container.querySelector('hr');
    expect(el?.classList.contains('my-divider')).toBe(true);
  });
});
