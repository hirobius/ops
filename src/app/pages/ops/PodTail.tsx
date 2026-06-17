/**
 * PodTail — compact polled stdout-tail surface for a single in-flight pod.
 *
 * Embedded inline under live SessionEvents on /ops/sessions per
 * 13w-ops-13a-live-pod-tail. Backed by usePodTail (2s polling against
 * /api/pod-tail?id=<podId>).
 *
 * Rendering rules:
 *   - Hidden until first fetch returns (loaded=false).
 *   - Empty state: "Tail starting…" placeholder.
 *   - Unavailable state (prod build w/o middleware): one-line note.
 *   - Once terminal event seen: muted "tail stopped" footer.
 */

import { useMemo } from 'react';
import hds from '@hirobius/design-system/tokens';
import { usePodTail } from './usePodTail';

interface PodTailProps {
  podId: string;
  /** When false, polling stops. Caller decides — typically derived from
   *  the parent SessionEvent's _status (in-flight vs. terminal). */
  isLive: boolean;
}

const containerStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: hds.space.px4,
  padding: `${hds.space.px8} ${hds.space.px12}`,
  borderLeft: `2px solid var(--semantic-color-border-default)`,
  background: 'var(--semantic-color-surface-raised)',
  borderRadius: hds.borderRadius.action,
  marginTop: hds.space.px4,
};

const lineStyle = {
  ...hds.typeStyles.technical,
  margin: 0,
  color: 'var(--semantic-color-content-secondary)',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const noteStyle = {
  ...hds.typeStyles.ui,
  margin: 0,
  color: 'var(--semantic-color-content-tertiary)',
  fontStyle: 'italic' as const,
};

export function PodTail({ podId, isLive }: PodTailProps) {
  const { events, loaded, unavailable, terminal } = usePodTail(podId, isLive);

  const formatted = useMemo(
    () =>
      events.map((e) => {
        const time = e.ts.slice(11, 19); // HH:MM:SS
        const dataPreview = e.data
          ? JSON.stringify(e.data).replace(/[{}"]/g, '').slice(0, 80)
          : '';
        return `${time}  ${e.event}  ${dataPreview}`;
      }),
    [events],
  );

  if (unavailable) {
    return (
      <div style={containerStyle}>
        <p style={noteStyle}>pod-tail endpoint unavailable (prod build without dev middleware)</p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div style={containerStyle}>
        <p style={noteStyle}>Tail starting…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={containerStyle}>
        <p style={noteStyle}>No events captured for {podId} yet.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {formatted.map((line, i) => (
        <p key={i} style={lineStyle}>{line}</p>
      ))}
      {terminal && (
        <p style={noteStyle}>tail stopped — terminal event observed</p>
      )}
    </div>
  );
}
