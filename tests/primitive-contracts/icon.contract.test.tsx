/**
 * Contract test: Icon
 * Verifies that Icon renders a Lucide icon with the expected data attribute
 * and size/color styles.
 *
 * @primitive Icon
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Circle } from 'lucide-react';
import { Icon } from '@/app/components/icon';

describe('Icon contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Icon icon={Circle} />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders an SVG element', () => {
    const { container } = render(<Icon icon={Circle} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('has data-hds-icon attribute', () => {
    const { container } = render(<Icon icon={Circle} />);
    const svg = container.querySelector('svg');
    expect(svg?.hasAttribute('data-hds-icon')).toBe(true);
  });

  it('is aria-hidden by default', () => {
    const { container } = render(<Icon icon={Circle} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('aria-hidden can be overridden to false', () => {
    const { container } = render(<Icon icon={Circle} aria-hidden={false} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('false');
  });

  it('className prop is applied to the svg', () => {
    const { container } = render(<Icon icon={Circle} className="my-icon" />);
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('my-icon')).toBe(true);
  });

  it('color prop applies stroke color on the SVG element', () => {
    const { container } = render(<Icon icon={Circle} color="red" />);
    const svg = container.querySelector('svg') as SVGElement;
    // Lucide renders color as the SVG stroke attribute
    expect(svg?.getAttribute('stroke')).toBe('red');
  });
});
