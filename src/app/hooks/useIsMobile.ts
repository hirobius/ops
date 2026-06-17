import { useEffect, useState } from 'react';

/**
 * Tracks whether the viewport is at or below a mobile breakpoint.
 * Local copy of the helper that previously lived in the (removed) HDS doc
 * primitives; the ops dashboard only needs this small piece.
 */
export function useIsMobile(maxWidth = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [maxWidth]);
  return isMobile;
}
