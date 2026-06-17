/**
 * Contract test: Text
 * Verifies that Text renders the expected HTML element for each variant
 * and that the style object is applied.
 *
 * @primitive Text
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Text } from '@/app/components/text';

describe('Text contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Text variant="body">Hello</Text>);
    expect(container.firstChild).not.toBeNull();
  });

  it('variant=display renders an h1', () => {
    const { container } = render(<Text variant="display">Display</Text>);
    expect(container.querySelector('h1')).not.toBeNull();
  });

  it('variant=heading1 renders an h1', () => {
    const { container } = render(<Text variant="heading1">H1</Text>);
    expect(container.querySelector('h1')).not.toBeNull();
  });

  it('variant=heading2 renders an h2', () => {
    const { container } = render(<Text variant="heading2">H2</Text>);
    expect(container.querySelector('h2')).not.toBeNull();
  });

  it('variant=heading3 renders an h3', () => {
    const { container } = render(<Text variant="heading3">H3</Text>);
    expect(container.querySelector('h3')).not.toBeNull();
  });

  it('variant=body renders a p', () => {
    const { container } = render(<Text variant="body">Body text</Text>);
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('variant=ui renders a p', () => {
    const { container } = render(<Text variant="ui">UI text</Text>);
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('variant=caption renders a p', () => {
    const { container } = render(<Text variant="caption">Caption</Text>);
    expect(container.querySelector('p')).not.toBeNull();
  });

  it('as prop overrides the default tag', () => {
    const { container } = render(<Text variant="body" as="span">Body as span</Text>);
    expect(container.querySelector('span')).not.toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders children content', () => {
    const { container } = render(<Text variant="body">Hello world</Text>);
    expect(container.textContent).toContain('Hello world');
  });

  it('className prop is forwarded', () => {
    const { container } = render(<Text variant="body" className="custom-text">Text</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el?.classList.contains('custom-text')).toBe(true);
  });

  it('margin is set to 0 via inline style', () => {
    const { container } = render(<Text variant="body">Text</Text>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.margin).toBe('0px');
  });
});
