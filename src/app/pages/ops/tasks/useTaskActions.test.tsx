/**
 * Tests for useTaskActions — visible action feedback + aria-live source
 * (ops#108).
 *
 * `act()`'s catch block used to be a bare catch commented "surfaced on next
 * poll" — a silent swallow. A failed dispatch/done/trash/etc. showed nothing
 * until the next background poll, if ever. `act()` now resolves a per-key
 * error message
 * (rendered inline by TaskRow, see TaskRow.test.tsx) and an `announcement`
 * string that TasksPage feeds into its `aria-live="polite"` status region.
 *
 * @testing-library/react is not installed; the hook is exercised through a
 * tiny harness component + act + createRoot, matching the fetch-mocking
 * convention in app/lib/opsApi.test.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTaskActions, type UseTaskActionsResult } from './useTaskActions';

function Harness({
  refetch,
  onResult,
}: {
  refetch: () => void;
  onResult: (r: UseTaskActionsResult) => void;
}) {
  const result = useTaskActions(refetch);
  onResult(result);
  return null;
}

function makeContainer(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

function cleanup(container: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

describe('useTaskActions — action feedback', () => {
  let container: HTMLDivElement;
  let root: Root;
  let refetch: ReturnType<typeof vi.fn>;
  let latest: UseTaskActionsResult;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
    refetch = vi.fn();
    act(() => {
      root.render(
        <Harness
          refetch={refetch}
          onResult={(r) => {
            latest = r;
          }}
        />,
      );
    });
  });

  afterEach(() => {
    cleanup(container, root);
    vi.restoreAllMocks();
  });

  it('clears any prior error and announces success when the action resolves ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    await act(async () => {
      await latest.act('t1', 'dispatch');
    });
    expect(latest.errors.has('t1')).toBe(false);
    expect(latest.announcement).toBe('Dispatched.');
    expect(refetch).toHaveBeenCalled();
  });

  it('surfaces a visible error when opsApi.post rejects, instead of swallowing it', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await act(async () => {
      await latest.act('t1', 'trash');
    });
    expect(latest.errors.get('t1')).toBe('Trashed failed: network down');
    expect(latest.announcement).toBe('Trashed failed: network down');
    expect(refetch).toHaveBeenCalled();
  });

  it('surfaces the server error body when the response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'task not found' }), { status: 404 }),
    );
    await act(async () => {
      await latest.act('t1', 'done');
    });
    expect(latest.errors.get('t1')).toBe('Marked done failed: task not found');
  });

  it('falls back to an HTTP status message when a non-ok response has no error body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 500 }));
    await act(async () => {
      await latest.act('t1', 'auto_on');
    });
    expect(latest.errors.get('t1')).toBe('Auto-dispatch turned on failed: HTTP 500');
  });

  it('clears the per-key error once a subsequent action on that key starts', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await latest.act('t1', 'dispatch');
    });
    expect(latest.errors.has('t1')).toBe(true);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await act(async () => {
      await latest.act('t1', 'dispatch');
    });
    expect(latest.errors.has('t1')).toBe(false);
  });

  it('keeps errors scoped per task key — one row failing does not flag another', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('boom'));
    await act(async () => {
      await latest.act('t1', 'dispatch');
    });
    expect(latest.errors.has('t1')).toBe(true);
    expect(latest.errors.has('t2')).toBe(false);
  });
});
