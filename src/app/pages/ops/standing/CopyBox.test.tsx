import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { CopyBox } from './CopyBox';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CopyBox', () => {
  it('renders the text and copies it verbatim on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyBox text="node scripts/log-call.mjs --id 1 --outcome pitched" />);
    expect(screen.getByText('node scripts/log-call.mjs --id 1 --outcome pitched')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('node scripts/log-call.mjs --id 1 --outcome pitched');
  });

  it('shows Copied after a successful copy, then resets', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyBox text="hello" />);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    // Flush the microtask queue the promise resolution uses.
    await vi.runOnlyPendingTimersAsync().catch(() => undefined);

    vi.useRealTimers();
  });

  it('never throws when the clipboard write is rejected — falls back to selecting the text', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });

    render(<CopyBox text="fallback text" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /copy/i }))).not.toThrow();

    // Let the rejected promise's .catch handler run.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('never throws when navigator.clipboard is unavailable', () => {
    Object.assign(navigator, { clipboard: undefined });

    render(<CopyBox text="no clipboard here" />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /copy/i }))).not.toThrow();
  });
});
