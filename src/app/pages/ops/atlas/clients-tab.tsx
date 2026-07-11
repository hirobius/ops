/* hds-bypass: ops-internal page */

/**
 * ClientsTab — render client registry as compact card grid.
 * Displays each client with slug, name, status badge, primary contact, and phase.
 * Links to /ops/clients/<slug> for detailed view.
 *
 * @category Internal
 * @tier utility
 */

import React from 'react';
import { Card, Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { CLIENT_REGISTRY } from '../clientRegistry';

export default function ClientsTab() {
  const clients = Object.entries(CLIENT_REGISTRY).sort(([a], [b]) => a.localeCompare(b));

  if (clients.length === 0) {
    return (
      <div style={s.empty}>
        <p style={s.emptyText}>No clients registered.</p>
      </div>
    );
  }

  return (
    <div style={s.grid}>
      {clients.map(([slug, files]) => {
        const meta = files.meta;
        const primaryContact = meta.contact?.name || meta.contact?.email || 'No contact';

        return (
          <a key={slug} href={`/ops/clients/${slug}`} className="hds-focus" style={s.linkReset}>
            <Card tone="neutral" padding="component">
              <Card.Header metadata={<Badge tone={statusTone(meta.status)}>{meta.status}</Badge>}>
                <Card.Title style={s.cardTitle}>{meta.name}</Card.Title>
                <Card.Description style={s.cardDesc}>{slug}</Card.Description>
              </Card.Header>
              <Card.Body>
                <Stack direction="column" gap="px4" style={s.bodyText}>
                  <span style={s.label}>Contact:</span>
                  <span style={s.value}>{primaryContact}</span>
                </Stack>
              </Card.Body>
            </Card>
          </a>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'live':
      return 'success';
    case 'prospect':
    case 'pending':
      return 'warning';
    case 'paused':
    case 'inactive':
      return 'danger';
    default:
      return 'neutral';
  }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: hds.semantic.space.section.inset,
  } satisfies React.CSSProperties,
  linkReset: {
    textDecoration: 'none',
    color: 'inherit',
  } satisfies React.CSSProperties,
  cardTitle: {
    margin: '0 0 4px',
    fontSize: hds.typeStyles.h3.fontSize,
    fontWeight: hds.typeStyles.h3.fontWeight,
    lineHeight: hds.typeStyles.h3.lineHeight,
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,
  cardDesc: {
    margin: 0,
    fontSize: hds.typeStyles.caption.fontSize,
    fontWeight: hds.typeStyles.caption.fontWeight,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,
  bodyText: {
    fontSize: hds.typeStyles.body.fontSize,
    lineHeight: hds.typeStyles.body.lineHeight,
  } satisfies React.CSSProperties,
  label: {
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,
  value: {
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,
  empty: {
    padding: hds.semantic.space.component.padding,
    textAlign: 'center',
  } satisfies React.CSSProperties,
  emptyText: {
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,
};
