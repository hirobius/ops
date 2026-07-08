/* hds-bypass: ops-internal page */

/**
 * ApprovalsPanel — renders the queued-for-dispatch approvals inbox directly
 * on `/ops` (epic #41 close-out; issue #8: "one queue on /ops where every
 * agent ask lands").
 *
 * Previously the only trace of the inbox on `/ops` itself was a SurfacesRail
 * link-tile with a live count — the queue itself only existed a click away at
 * `/admin/approvals`. This panel is the same live `dispatch_status==='queued'`
 * data (`useApprovalsInbox`, shared with `Approvals.tsx`/`ApprovalDetail.tsx`)
 * rendered inline, newest-`limit` first, with the same Approve/Deny actions —
 * matching the "glance and act" treatment the Fleet/Runs sections already get.
 * Overflow past `limit` links to the full `/admin/approvals` inbox.
 */

import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { ApprovalsInboxResult } from '../../admin/useApprovalsInbox';

export interface ApprovalsPanelProps {
  /** The shared inbox hook's result — owned by the page (one poll, not one per panel). */
  inbox: ApprovalsInboxResult;
  /** Max rows rendered inline before overflowing to a "view all" link. Default 5. */
  limit?: number;
}

export function ApprovalsPanel({ inbox, limit = 5 }: ApprovalsPanelProps) {
  const { queued, loaded, busyKeys, errorMessage, approve, deny } = inbox;

  if (!loaded) {
    return <p style={s.empty}>Loading approvals…</p>;
  }

  if (queued.length === 0) {
    return (
      <p style={s.empty}>
        Nothing waiting — queue a task from{' '}
        <Link to="/ops/tasks" style={s.inlineLink}>
          /ops/tasks
        </Link>{' '}
        or turn on auto-dispatch.
      </p>
    );
  }

  const visible = queued.slice(0, limit);
  const overflow = queued.length - visible.length;

  return (
    <Stack direction="column" gap="px8">
      {errorMessage ? (
        <p style={s.error} data-role="approvals-panel-error">
          {errorMessage}
        </p>
      ) : null}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Task</th>
              <th style={{ ...s.th, width: '18%' }}>Routing</th>
              <th style={{ ...s.th, width: '24%' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const busy = busyKeys.has(t.key);
              return (
                <tr key={t.key} style={s.row}>
                  <td style={s.td}>
                    <Link
                      to={`/admin/approvals/${encodeURIComponent(t.key)}`}
                      style={s.titleLink}
                    >
                      {t.title}
                    </Link>
                    <div style={s.meta}>{t.key}</div>
                  </td>
                  <td style={s.td}>
                    {t.tier ? (
                      <Badge tone="info">
                        {t.tier}
                        {t.model ? ` · ${t.model}` : ''}
                      </Badge>
                    ) : null}
                  </td>
                  <td style={s.td}>
                    <Stack direction="row" gap="px8">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy}
                        onClick={() => approve(t.key)}
                        aria-label={`Approve ${t.key}`}
                        data-role="approvals-panel-approve"
                      >
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => deny(t.key)}
                        aria-label={`Deny ${t.key}`}
                        data-role="approvals-panel-deny"
                      >
                        Deny
                      </Button>
                    </Stack>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {overflow > 0 ? (
        <Link to="/admin/approvals" style={s.inlineLink}>
          + {overflow} more — view all in the inbox
        </Link>
      ) : null}
    </Stack>
  );
}

const s = {
  empty: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-secondary)',
  } satisfies CSSProperties,

  error: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-danger)',
  } satisfies CSSProperties,

  inlineLink: {
    color: 'var(--semantic-color-content-primary)',
  } satisfies CSSProperties,

  tableWrap: {
    overflowX: 'auto',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 'var(--semantic-radius-card)',
  } satisfies CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: hds.typeStyles.caption.fontSize,
    tableLayout: 'fixed',
  } satisfies CSSProperties,

  th: {
    textAlign: 'left',
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-secondary)',
    borderBottom: '1px solid var(--semantic-color-border-default)',
    fontSize: hds.typeStyles.caption.fontSize,
    whiteSpace: 'nowrap',
  } satisfies CSSProperties,

  row: {
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
  } satisfies CSSProperties,

  td: {
    padding: `${hds.space.px6} ${hds.space.px12}`,
    verticalAlign: 'middle',
    color: 'var(--semantic-color-content-primary)',
  } satisfies CSSProperties,

  titleLink: {
    color: 'var(--semantic-color-content-primary)',
    fontWeight: 500,
  } satisfies CSSProperties,

  meta: {
    color: 'var(--semantic-color-content-tertiary)',
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
  } satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
