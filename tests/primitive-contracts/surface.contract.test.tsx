/**
 * Contract test: HdsSurface
 * Verifies that HdsSurface renders with the expected data attributes and
 * padding inline styles for each padding option.
 * ThemeContext has a default value so no Provider is needed.
 *
 * @primitive HdsSurface
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HdsSurface } from '@/app/components/HdsSurface';

describe('HdsSurface contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<HdsSurface>Content</HdsSurface>);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders a div by default', () => {
    const { container } = render(<HdsSurface>Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.tagName.toLowerCase()).toBe('div');
  });

  it('has data-hds-surface="true"', () => {
    const { container } = render(<HdsSurface>Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.getAttribute('data-hds-surface')).toBe('true');
  });

  it('has data-hds-component="HdsSurface"', () => {
    const { container } = render(<HdsSurface>Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.getAttribute('data-hds-component')).toBe('HdsSurface');
  });

  it('data-hds-metrics reflects default padding', () => {
    const { container } = render(<HdsSurface>Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.getAttribute('data-hds-metrics')).toBe('padding:component');
  });

  it('padding="item" is reflected in data-hds-metrics', () => {
    const { container } = render(<HdsSurface padding="item">Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.getAttribute('data-hds-metrics')).toBe('padding:item');
  });

  it('padding="none" sets inline padding to 0px', () => {
    const { container } = render(<HdsSurface padding="none">Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.padding).toBe('0px');
  });

  it('padding="px16" sets inline padding to 16px', () => {
    const { container } = render(<HdsSurface padding="px16">Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.padding).toBe('16px');
  });

  it('as prop changes the rendered element', () => {
    const { container } = render(<HdsSurface as="section">Content</HdsSurface>);
    const el = container.querySelector('section');
    expect(el).not.toBeNull();
  });

  it('className prop is forwarded', () => {
    const { container } = render(<HdsSurface className="custom-surface">Content</HdsSurface>);
    const el = container.firstChild as HTMLElement;
    expect(el?.classList.contains('custom-surface')).toBe(true);
  });
});
