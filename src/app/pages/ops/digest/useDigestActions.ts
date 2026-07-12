/**
 * useDigestActions — the digest board's mutation seam (ops#78). Mirrors
 * useTaskActions: POST /api/digest-action with per-key busy tracking, always
 * refetching after a mutation so the poll reflects the write. Errors are
 * swallowed here on purpose — the board surfaces state via the next poll.
 */

import { useCallback, useState } from 'react';
import { opsApi } from '../../../lib/opsApi';
import type { DigestAction } from './types';

export interface UseDigestActionsResult {
  act: (itemKey: string, action: DigestAction) => Promise<void>;
  busyKeys: ReadonlySet<string>;
}

export function useDigestActions(refetch: () => void): UseDigestActionsResult {
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());

  const act = useCallback(
    async (itemKey: string, action: DigestAction) => {
      setBusyKeys((prev) => new Set(prev).add(itemKey));
      try {
        await opsApi.post('/api/digest-action', { key: itemKey, action });
      } catch {
        /* surfaced on next poll */
      } finally {
        setBusyKeys((prev) => {
          const next = new Set(prev);
          next.delete(itemKey);
          return next;
        });
        refetch();
      }
    },
    [refetch],
  );

  return { act, busyKeys };
}
