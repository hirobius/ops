/* hds-bypass: ops-internal page */

/**
 * TokensTab — browse the Hirobius token hierarchy at /ops/atlas#tokens.
 *
 * Renders the four tiers of hirobius.tokens.json (primitive → semantic →
 * component → role) as collapsible <details> sections. Each leaf row shows
 * the token path, resolved value, and alias target when the value is a
 * reference string.
 *
 * @category Internal
 * @tier utility
 */

import React, { useState } from 'react';
import { Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import tokensRaw from '../../../../../hirobius.tokens.json';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TokenLeaf {
  path: string;
  value: string;
  isAlias: boolean;
  aliasTarget?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recursively walk a token tier, collecting leaf entries with dotted paths. */
function collectLeaves(obj: Record<string, unknown>, prefix: string, results: TokenLeaf[]): void {
  if (typeof obj !== 'object' || obj === null) return;

  // W3C Design Token format: leaf has $value
  if ('$value' in obj) {
    const raw = obj['$value'];
    const valueStr = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    const isAlias = typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}');
    results.push({
      path: prefix,
      value: isAlias ? '' : valueStr,
      isAlias,
      aliasTarget: isAlias ? (raw as string).slice(1, -1) : undefined,
    });
    return;
  }

  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith('$')) continue; // skip $type, $description, $schema
    collectLeaves(val as Record<string, unknown>, prefix ? `${prefix}.${key}` : key, results);
  }
}

const TIERS = ['primitive', 'semantic', 'component', 'role'] as const;
type Tier = (typeof TIERS)[number];

const TIER_LABELS: Record<Tier, string> = {
  primitive: 'Primitive',
  semantic: 'Semantic',
  component: 'Component',
  role: 'Role',
};

const COLLAPSED_DEFAULT = 8;

// ── Sub-components ────────────────────────────────────────────────────────────

function TierSection({ tier, leaves }: { tier: Tier; leaves: TokenLeaf[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? leaves : leaves.slice(0, COLLAPSED_DEFAULT);

  return (
    <details open style={s.details}>
      <summary style={s.summary}>
        <span style={s.summaryLabel}>
          {TIER_LABELS[tier]}
          <span style={s.count}>{leaves.length} tokens</span>
        </span>
      </summary>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '45%' }}>Path</th>
              <th style={{ ...s.th, width: '35%' }}>Value</th>
              <th style={{ ...s.th, width: '20%' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((leaf) => (
              <tr key={leaf.path} style={s.row}>
                <td style={{ ...s.td, ...s.pathCell }}>
                  <code style={s.code}>{leaf.path}</code>
                </td>
                <td style={{ ...s.td, ...s.valueCell }}>
                  {leaf.isAlias ? (
                    <code style={{ ...s.code, color: 'var(--semantic-color-content-tertiary)' }}>
                      → {leaf.aliasTarget}
                    </code>
                  ) : (
                    <span style={s.valueLiteral}>{leaf.value.slice(0, 60)}</span>
                  )}
                </td>
                <td style={s.td}>
                  <Badge tone={leaf.isAlias ? 'info' : 'neutral'}>
                    {leaf.isAlias ? 'alias' : 'literal'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {leaves.length > COLLAPSED_DEFAULT && (
          <button
            style={s.expandBtn}
            onClick={() => setExpanded((e) => !e)}
            type="button"
            className="hds-focus"
          >
            {expanded
              ? `Show fewer (${COLLAPSED_DEFAULT} of ${leaves.length})`
              : `Show all ${leaves.length} tokens`}
          </button>
        )}
      </div>
    </details>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TokensTab() {
  const tokens = tokensRaw as unknown as Record<string, Record<string, unknown>>;

  const tierData: Record<Tier, TokenLeaf[]> = {
    primitive: [],
    semantic: [],
    component: [],
    role: [],
  };

  for (const tier of TIERS) {
    if (tier in tokens) {
      collectLeaves(tokens[tier], tier, tierData[tier]);
    }
  }

  const totalTokens = TIERS.reduce((sum, t) => sum + tierData[t].length, 0);

  return (
    <Stack direction="column" gap="inset">
      <div style={s.headerRow}>
        <span style={s.headerTitle}>Design Token Hierarchy</span>
        <span style={s.headerMeta}>
          {totalTokens} tokens across {TIERS.length} tiers
        </span>
      </div>

      <Stack direction="column" gap="px12">
        {TIERS.map((tier) => (
          <TierSection key={tier} tier={tier} leaves={tierData[tier]} />
        ))}
      </Stack>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  headerRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.space.px8,
  } satisfies React.CSSProperties,

  headerTitle: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,

  headerMeta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  details: {
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 'var(--semantic-radius-card)',
    overflow: 'hidden',
  } satisfies React.CSSProperties,

  summary: {
    display: 'flex',
    alignItems: 'center',
    padding: `${hds.space.px8} ${hds.space.px12}`,
    cursor: 'pointer',
    background: 'var(--semantic-color-surface-raised)',
    userSelect: 'none',
  } satisfies React.CSSProperties,

  summaryLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,

  count: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  tableWrap: {
    overflowX: 'auto',
  } satisfies React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: hds.typeStyles.caption.fontSize,
  } satisfies React.CSSProperties,

  th: {
    textAlign: 'left',
    padding: `${hds.space.px4} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-page)',
    color: 'var(--semantic-color-content-secondary)',
    borderBottom: '1px solid var(--semantic-color-border-default)',
    fontSize: hds.typeStyles.caption.fontSize,
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  row: {
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
  } satisfies React.CSSProperties,

  td: {
    padding: `${hds.space.px4} ${hds.space.px12}`,
    verticalAlign: 'middle',
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,

  pathCell: {
    maxWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  valueCell: {
    maxWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies React.CSSProperties,

  code: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-primary)',
    background: 'transparent',
  } satisfies React.CSSProperties,

  valueLiteral: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,

  expandBtn: {
    display: 'block',
    width: '100%',
    padding: `${hds.space.px8} ${hds.space.px12}`,
    background: 'transparent',
    border: 'none',
    borderTop: '1px solid var(--semantic-color-border-subtle)',
    cursor: 'pointer',
    color: 'var(--semantic-color-content-link)',
    fontSize: hds.typeStyles.caption.fontSize,
    textAlign: 'center',
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
