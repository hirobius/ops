/**
 * usePoll — timer behaviour, with `intervalMs: 0` as the manual-only mode.
 *
 * The manual mode exists for cost, not ergonomics. Every scheduled tick of the
 * Standing dashboard is a serverless invocation against `/api/tasks`, which in
 * turn calls the GitHub API; a dashboard left open on a second monitor billed
 * ~90 invocations an hour while nobody was reading it. `intervalMs: 0` keeps
 * the one fetch on mount and the manual `refetch`, and schedules nothing.
 *
 * The guarantee under test is narrow and load-bearing: in manual mode NO timer
 * is ever armed — not on mount, and not when the tab is re-shown, which is the
 * path that would quietly resurrect polling for anyone who tabs away and back.
 *
 * Note for anyone extending this file: `waitFor` fights fake timers here, so
 * every wait is an explicit microtask flush inside `act` instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePoll } from './usePoll';

/** Drive `document.visibilityState`, which usePoll reads directly. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

/**
 * Let the mount effect run and its fetch settle. A couple of microtask ticks is
 * not enough — the effect has to commit first — so yield through a 1ms timer.
 */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
}

/** Jump far past any plausible interval. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const TEN_MINUTES = 10 * 60_000;

beforeEach(() => {
  // `shouldAdvanceTime` keeps the microtask queue real, so the mount fetch's
  // promise chain settles. Without it the default `toFake` set stubs enough of
  // the scheduler that `fetchOnce` never resolves and every test reads 0 calls.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setVisibility('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePoll with intervalMs: 0 (manual only)', () => {
  it('fetches once on mount and never schedules another', async () => {
    const fetcher = vi.fn().mockResolvedValue('payload');
    renderHook(() => usePoll(fetcher, { intervalMs: 0 }));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    // The direct invariant: nothing is armed at all.
    expect(vi.getTimerCount()).toBe(0);

    await advance(TEN_MINUTES);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not resume polling when the tab is hidden and re-shown', async () => {
    const fetcher = vi.fn().mockResolvedValue('payload');
    renderHook(() => usePoll(fetcher, { intervalMs: 0 }));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => setVisibility('hidden'));
    await act(async () => setVisibility('visible'));
    await flush();

    await advance(TEN_MINUTES);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('still fetches on an explicit refetch, and arms no timer afterwards', async () => {
    const fetcher = vi.fn().mockResolvedValue('payload');
    const { result } = renderHook(() => usePoll(fetcher, { intervalMs: 0 }));
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
    });
    await flush();
    expect(fetcher).toHaveBeenCalledTimes(2);

    await advance(TEN_MINUTES);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('exposes lastUpdatedAt so the page can show how stale the data is', async () => {
    const fetcher = vi.fn().mockResolvedValue('payload');
    const { result } = renderHook(() => usePoll(fetcher, { intervalMs: 0 }));
    await flush();
    expect(result.current.data).toBe('payload');
    expect(result.current.lastUpdatedAt).toBeTypeOf('number');
  });
});

describe('usePoll with a positive interval still polls', () => {
  it('arms a timer after the mount fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue('payload');
    renderHook(() => usePoll(fetcher, { intervalMs: 30_000 }));
    await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    // The abort timer is cleared in `finally`, so anything still pending here
    // is the poll timer — the behaviour manual mode must NOT have.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });
});
