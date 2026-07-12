/**
 * useToast — a minimal, page-scoped toast stack (ops#113).
 *
 * The board had no toast primitive before "Run Ralph" — its DoD is explicit
 * that a workflow_dispatch failure (e.g. GITHUB_TOKEN missing "Actions:
 * write") must not fail silently. This is deliberately small: an in-memory
 * queue that self-dismisses after a few seconds, not a global notification
 * system — if a second surface needs toasts later, promote it then.
 */

import { useCallback, useRef, useState } from 'react';

export interface ToastMessage {
  id: number;
  tone: 'success' | 'danger';
  text: string;
}

const AUTO_DISMISS_MS = 6000;

export interface UseToastResult {
  toasts: ToastMessage[];
  notify: (text: string, tone: ToastMessage['tone']) => void;
  dismiss: (id: number) => void;
}

export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (text: string, tone: ToastMessage['tone']) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, tone, text }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  return { toasts, notify, dismiss };
}
