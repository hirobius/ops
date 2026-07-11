/**
 * useTaskSelection — the multi-select / "Copy refs" subsystem (ops#136).
 *
 * Folded in from the retired /ops/issues surface: select issue-backed rows,
 * copy their `owner/repo#N` refs to paste into a chat. Isolated here so the
 * board page stays about the board.
 */

import { useCallback, useMemo, useState } from 'react';
import type { Task } from './types';
import { taskRef } from './taskMeta';
import { copyText } from './clipboard';

export interface UseTaskSelectionResult {
  selected: ReadonlySet<string>;
  toggleSelect: (key: string) => void;
  clearSelection: () => void;
  selectedRefs: string[];
  copySelectedRefs: () => void;
}

export function useTaskSelection(tasks: Task[] | null): UseTaskSelectionResult {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const toggleSelect = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const selectedRefs = useMemo(
    () =>
      (tasks ?? [])
        .filter((t) => selected.has(t.key))
        .map(taskRef)
        .filter((r): r is string => !!r),
    [tasks, selected],
  );

  const copySelectedRefs = useCallback(() => {
    void copyText(selectedRefs.join('\n'));
  }, [selectedRefs]);

  return { selected, toggleSelect, clearSelection, selectedRefs, copySelectedRefs };
}
