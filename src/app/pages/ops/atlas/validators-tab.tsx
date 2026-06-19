/* hds-bypass: ops-internal page */

/**
 * ValidatorsTab — scannable table of all guardrail gates at /ops/atlas#validators.
 *
 * Reads docs/guardrails/registry.json, sorts by severity (error first) then id,
 * and renders each gate as a row: id | severity badge | gateScript | fixture? | owner.
 *
 * Severity mapping: 'error' → 'danger', 'warn' → 'info'.
 *
 * @category Internal
 * @tier utility
 */

import React, { useState } from 'react';
import { Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import registryRaw from '../../../../../docs/guardrails/registry.json';

// ── Types ─────────────────────────────────────────────────────────────────────

type Severity = 'error' | 'warn' | string;

interface Gate {
  id: string;
  description?: string;
  severity: Severity;
  gateScript: string;
  fixturePath: string | null;
  owner?: string;
  lastFiringAt?: string | null;
  lastViolationAt?: string | null;
}

const DORMANT_DAYS = 90;

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

function lastFiredLabel(iso: string | null | undefined): string {
  const d = daysSince(iso);
  if (d === null) return 'never';
  if (d === 0) return 'today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

function isDormant(iso: string | null | undefined): boolean {
  const d = daysSince(iso);
  return d === null || d >= DORMANT_DAYS;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityTone(severity: Severity): 'danger' | 'info' | 'neutral' {
  if (severity === 'error') return 'danger';
  if (severity === 'warn') return 'info';
  return 'neutral';
}

function severityOrder(severity: Severity): number {
  if (severity === 'error') return 0;
  if (severity === 'warn') return 1;
  return 2;
}

function sortGates(gates: Gate[]): Gate[] {
  return [...gates].sort((a, b) => {
    const severityDiff = severityOrder(a.severity) - severityOrder(b.severity);
    if (severityDiff !== 0) return severityDiff;
    return a.id.localeCompare(b.id);
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ValidatorsTab() {
  const registry = registryRaw as { version: string; gates: Gate[] };
  const gates = sortGates(registry.gates);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const errorCount = gates.filter((g) => g.severity === 'error').length;
  const warnCount = gates.filter((g) => g.severity === 'warn').length;
  const fixtureCount = gates.filter((g) => g.fixturePath !== null).length;
  const dormantCount = gates.filter((g) => isDormant(g.lastFiringAt)).length;

  return (
    <Stack direction="column" gap="inset">
      <div style={s.headerRow}>
        <span style={s.headerTitle}>Guardrail Registry</span>
        <div style={s.headerStats}>
          <Badge tone="danger">{errorCount} error</Badge>
          <Badge tone="info">{warnCount} warn</Badge>
          <Badge tone="neutral">{dormantCount} dormant</Badge>
          <span style={s.headerMeta}>
            {fixtureCount}/{gates.length} with fixture
          </span>
        </div>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '22%' }}>Gate ID</th>
              <th style={{ ...s.th, width: '10%' }}>Severity</th>
              <th style={{ ...s.th, width: '28%' }}>Script</th>
              <th style={{ ...s.th, width: '8%' }}>Fixture</th>
              <th style={{ ...s.th, width: '14%' }}>Last fired</th>
              <th style={{ ...s.th, width: '10%' }}>Owner</th>
            </tr>
          </thead>
          <tbody>
            {gates.map((gate) => {
              const isExpanded = expandedId === gate.id;
              return (
                <React.Fragment key={gate.id}>
                  <tr
                    style={{ ...s.row, ...(isExpanded ? s.rowExpanded : {}) }}
                    onClick={() => setExpandedId(isExpanded ? null : gate.id)}
                  >
                    <td style={{ ...s.td, ...s.idCell }}>
                      <code style={s.code}>{gate.id}</code>
                    </td>
                    <td style={s.td}>
                      <Badge tone={severityTone(gate.severity)}>{gate.severity}</Badge>
                    </td>
                    <td style={{ ...s.td, ...s.scriptCell }}>
                      <code style={s.scriptCode}>{gate.gateScript}</code>
                    </td>
                    <td style={{ ...s.td, ...s.fixtureCell }}>
                      {gate.fixturePath !== null ? (
                        <span style={s.fixturePresent} title={gate.fixturePath}>
                          ✓
                        </span>
                      ) : (
                        <span style={s.fixtureAbsent}>✗</span>
                      )}
                    </td>
                    <td style={{ ...s.td, ...s.firedCell }}>
                      <span
                        style={isDormant(gate.lastFiringAt) ? s.firedDormant : undefined}
                        title={gate.lastFiringAt ?? 'never fired'}
                      >
                        {lastFiredLabel(gate.lastFiringAt)}
                      </span>
                      {isDormant(gate.lastFiringAt) && (
                        <span style={s.dormantBadge} title={`>=${DORMANT_DAYS}d since last fire`}>
                          dormant?
                        </span>
                      )}
                    </td>
                    <td style={{ ...s.td, ...s.ownerCell }}>{gate.owner ?? '—'}</td>
                  </tr>
                  {isExpanded && gate.description && (
                    <tr style={s.descRow}>
                      <td colSpan={6} style={s.descCell}>
                        <span style={s.descText}>{gate.description}</span>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.space.px8,
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  headerTitle: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
    flexShrink: 0,
  } satisfies React.CSSProperties,

  headerStats: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  headerMeta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  tableWrap: {
    overflowX: 'auto',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 'var(--semantic-radius-card)',
  } satisfies React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: hds.typeStyles.caption.fontSize,
    tableLayout: 'fixed',
  } satisfies React.CSSProperties,

  th: {
    textAlign: 'left',
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-secondary)',
    borderBottom: '1px solid var(--semantic-color-border-default)',
    fontSize: hds.typeStyles.caption.fontSize,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } satisfies React.CSSProperties,

  row: {
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
    cursor: 'pointer',
    transition: `background ${hds.duration.instant}`,
  } satisfies React.CSSProperties,

  rowExpanded: {
    background: 'var(--semantic-color-surface-raised)',
  } satisfies React.CSSProperties,

  td: {
    padding: `${hds.space.px4} ${hds.space.px12}`,
    verticalAlign: 'middle',
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  idCell: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
  } satisfies React.CSSProperties,

  scriptCell: {
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,

  fixtureCell: {
    textAlign: 'center',
  } satisfies React.CSSProperties,

  ownerCell: {
    color: 'var(--semantic-color-content-secondary)',
    fontSize: hds.typeStyles.caption.fontSize,
  } satisfies React.CSSProperties,

  code: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-primary)',
    background: 'transparent',
  } satisfies React.CSSProperties,

  scriptCode: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-secondary)',
    background: 'transparent',
  } satisfies React.CSSProperties,

  fixturePresent: {
    color: 'var(--semantic-color-feedback-success)',
  } satisfies React.CSSProperties,

  fixtureAbsent: {
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  firedCell: {
    color: 'var(--semantic-color-content-secondary)',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px6,
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  firedDormant: {
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  dormantBadge: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '10px',
    padding: `0 ${hds.space.px4}`,
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 'var(--semantic-radius-pill, 9999px)',
    color: 'var(--semantic-color-content-tertiary)',
    background: 'var(--semantic-color-surface-raised)',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  descRow: {
    background: 'var(--semantic-color-surface-raised)',
  } satisfies React.CSSProperties,

  descCell: {
    padding: `${hds.space.px4} ${hds.space.px12} ${hds.space.px8}`,
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
  } satisfies React.CSSProperties,

  descText: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
    whiteSpace: 'normal',
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
