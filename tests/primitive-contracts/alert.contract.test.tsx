/**
 * Contract test: Alert
 * Verifies that Alert renders with the correct role and that variant-driven
 * background style variables are applied to the container.
 *
 * @primitive Alert
 * @unit 12p-test-contract-tests-primitives
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Alert } from '@/app/components/alert';

describe('Alert contract', () => {
  it('renders without crashing', () => {
    const { container } = render(<Alert>Message</Alert>);
    expect(container.firstChild).not.toBeNull();
  });

  it('has role="alert"', () => {
    const { container } = render(<Alert>Message</Alert>);
    const el = container.querySelector('[role="alert"]');
    expect(el).not.toBeNull();
  });

  it('renders children content', () => {
    const { container } = render(<Alert>Error occurred</Alert>);
    expect(container.textContent).toContain('Error occurred');
  });

  it('variant=success renders feedback-bg-success style', () => {
    const { container } = render(<Alert variant="success">OK</Alert>);
    const el = container.querySelector('[role="alert"]') as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-success');
  });

  it('variant=error renders feedback-bg-error style', () => {
    const { container } = render(<Alert variant="error">Fail</Alert>);
    const el = container.querySelector('[role="alert"]') as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-error');
  });

  it('variant=warning renders feedback-bg-warning style', () => {
    const { container } = render(<Alert variant="warning">Warn</Alert>);
    const el = container.querySelector('[role="alert"]') as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-warning');
  });

  it('variant=info renders feedback-bg-info style (default)', () => {
    const { container } = render(<Alert>Info</Alert>);
    const el = container.querySelector('[role="alert"]') as HTMLElement;
    expect(el?.style.background).toContain('semantic-color-feedback-bg-info');
  });

  it('title prop renders heading text', () => {
    const { container } = render(<Alert title="Heads up" variant="warning">Detail</Alert>);
    expect(container.textContent).toContain('Heads up');
  });
});
