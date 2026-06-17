/**
 * Contract test: HdsButton
 * Verifies that variant and size props produce the expected Tailwind classes
 * on the rendered button element.
 *
 * @primitive HdsButton
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HdsButton } from '@/app/components/HdsButton';

describe('HdsButton contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<HdsButton>Label</HdsButton>);
    expect(container.querySelector('button')).not.toBeNull();
  });

  it('has role="button"', () => {
    const { container } = render(<HdsButton>Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.tagName.toLowerCase()).toBe('button');
  });

  it('variant=primary emits bg-primary class', () => {
    const { container } = render(<HdsButton variant="primary">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.className).toContain('bg-primary');
  });

  it('variant=secondary emits border class', () => {
    const { container } = render(<HdsButton variant="secondary">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.className).toContain('border');
  });

  it('variant=tertiary does not emit bg-primary', () => {
    const { container } = render(<HdsButton variant="tertiary">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.className).not.toContain('bg-primary');
  });

  it('size=sm emits h-8 class', () => {
    const { container } = render(<HdsButton size="sm">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.className).toContain('h-8');
  });

  it('size=md emits h-10 class', () => {
    const { container } = render(<HdsButton size="md">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.className).toContain('h-10');
  });

  it('size=lg emits h-12 class', () => {
    const { container } = render(<HdsButton size="lg">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.className).toContain('h-12');
  });

  it('data-variant attribute reflects the variant prop', () => {
    const { container } = render(<HdsButton variant="primary">Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.getAttribute('data-variant')).toBe('primary');
  });

  it('loading=true sets aria-busy', () => {
    const { container } = render(<HdsButton loading>Label</HdsButton>);
    const el = container.querySelector('button');
    expect(el?.getAttribute('aria-busy')).toBe('true');
  });

  it('disabled=true disables the button', () => {
    const { container } = render(<HdsButton disabled>Label</HdsButton>);
    const el = container.querySelector('button') as HTMLButtonElement;
    expect(el?.disabled).toBe(true);
  });
});
