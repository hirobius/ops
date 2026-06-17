/**
 * Contract test: Badge
 * Verifies that Badge renders with the expected inline styles for each tone.
 * ThemeContext has a default value so no Provider is needed.
 *
 * @primitive Badge
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from '@/app/components/badge';

describe('Badge contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Badge>v1.0</Badge>);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders children content', () => {
    const { container } = render(<Badge>v1.0</Badge>);
    expect(container.textContent).toContain('v1.0');
  });

  it('renders a span element by default', () => {
    const { container } = render(<Badge>Label</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.tagName.toLowerCase()).toBe('span');
  });

  it('tone=info applies feedback-bg-info background style', () => {
    const { container } = render(<Badge tone="info">Info</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-info');
  });

  it('tone=success applies feedback-bg-success background style', () => {
    const { container } = render(<Badge tone="success">OK</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-success');
  });

  it('tone=danger applies feedback-bg-error background style', () => {
    const { container } = render(<Badge tone="danger">Error</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-error');
  });

  it('tone=warning applies feedback-bg-warning background style', () => {
    const { container } = render(<Badge tone="warning">Warn</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-warning');
  });

  it('as="div" renders a div element', () => {
    const { container } = render(<Badge as="div">Label</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.tagName.toLowerCase()).toBe('div');
  });

  it('has display inline-flex style', () => {
    const { container } = render(<Badge>Label</Badge>);
    const el = container.firstChild as HTMLElement;
    expect(el?.style.display).toBe('inline-flex');
  });
});
