/**
 * Contract test: Input
 * Verifies that size and state props produce the expected Tailwind classes
 * and DOM attributes on the rendered input element.
 *
 * @primitive Input
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Input } from '@/app/components/input';

describe('Input contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Input />);
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('has an input element by default', () => {
    const { container } = render(<Input placeholder="Enter text" />);
    const input = container.querySelector('input');
    expect(input).not.toBeNull();
  });

  it('size=sm emits h-8 class on the input', () => {
    const { container } = render(<Input size="sm" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('h-8');
  });

  it('size=md emits h-10 class on the input', () => {
    const { container } = render(<Input size="md" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('h-10');
  });

  it('size=lg emits h-12 class on the input', () => {
    const { container } = render(<Input size="lg" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('h-12');
  });

  it('textStyle=mono emits font-mono class', () => {
    const { container } = render(<Input textStyle="mono" />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('font-mono');
  });

  it('error=true emits border-destructive class', () => {
    const { container } = render(<Input error />);
    const input = container.querySelector('input');
    expect(input?.className).toContain('border-destructive');
  });

  it('disabled=true disables the input', () => {
    const { container } = render(<Input disabled />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input?.disabled).toBe(true);
  });

  it('label prop renders a label element', () => {
    const { container } = render(<Input label="Username" />);
    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain('Username');
  });
});
