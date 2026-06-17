/* hds-bypass: ops-internal staging chrome — inline styles intentional. */

/**
 * Staging chrome — SpecimenCard, FilterBar, QueueBar, PromoteForm.
 * All UI for the /ops/staging surface beyond the page header itself.
 */

import { useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, X, Copy, Trash2 } from 'lucide-react';
import hds from '@hirobius/design-system/tokens';

import {
  FAMILY_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  type ChipTone,
  type Specimen,
  type SpecimenFamily,
  type SpecimenStatus,
} from './types';

import {
  addToQueue,
  copyQueueAsJson,
  newEntryId,
  removeFromQueue,
  type PromotionEntry,
  type SuggestedTier,
} from './promote-queue';

const stagingChromeStyles = {
  chipBase: {
    fontSize: hds.fontSize['2xs'],
    padding: `${hds.space.px2} ${hds.space.px6}`,
    borderRadius: hds.borderRadius.sm,
    textTransform: 'uppercase' as const, // eyebrow-ok: compact tier chip — smaller than hds.typeStyles.eyebrow
    letterSpacing: '0.06em',
    whiteSpace: 'nowrap' as const,
  } satisfies React.CSSProperties,
  tierLabelBase: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px4,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    cursor: 'pointer',
    borderRadius: hds.borderRadius.sm,
  } satisfies React.CSSProperties,
  filterChipBtnBase: {
    padding: `${hds.space.px4} ${hds.space.px8}`,
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.full,
    cursor: 'pointer',
  } satisfies React.CSSProperties,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tonal chip
// ─────────────────────────────────────────────────────────────────────────────

function chipColors(tone: ChipTone): { color: string; bg: string } {
  switch (tone) {
    case 'success':
      return {
        color: 'var(--semantic-color-feedback-success)',
        bg: 'var(--semantic-color-feedback-bg-success)',
      };
    case 'warning':
      return {
        color: 'var(--semantic-color-feedback-warning)',
        bg: 'var(--semantic-color-feedback-bg-warning)',
      };
    case 'danger':
      return {
        color: 'var(--semantic-color-feedback-error)',
        bg: 'var(--semantic-color-feedback-bg-error)',
      };
    case 'info':
      return {
        color: 'var(--semantic-color-feedback-info)',
        bg: 'var(--semantic-color-feedback-bg-info)',
      };
    case 'subdued':
      return {
        color: 'var(--semantic-color-content-disabled)',
        bg: 'var(--semantic-color-surface-raised)',
      };
    case 'neutral':
    default:
      return {
        color: 'var(--semantic-color-content-secondary)',
        bg: 'var(--semantic-color-surface-raised)',
      };
  }
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: ChipTone }) {
  const c = chipColors(tone);
  return (
    <span
      style={{ ...hds.typeStyles.mono, ...stagingChromeStyles.chipBase, color: c.color, background: c.bg }}
    >
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Specimen card — header strip + body
// ─────────────────────────────────────────────────────────────────────────────

interface SpecimenCardProps {
  spec: Specimen;
  onQueued: (entry: PromotionEntry) => void;
}

export function SpecimenCard({ spec, onQueued }: SpecimenCardProps) {
  const [promoteOpen, setPromoteOpen] = useState(false);

  function handleQueued(entry: PromotionEntry) {
    addToQueue(entry);
    onQueued(entry);
    setPromoteOpen(false);
  }

  return (
    <article style={cardStyles.root}>
      <header style={cardStyles.head}>
        <div style={cardStyles.headLeft}>
          <h3 style={cardStyles.name}>{spec.name}</h3>
          <div style={cardStyles.chips}>
            <Chip tone="info">{spec.source}</Chip>
            {spec.status && (
              <Chip tone={STATUS_TONE[spec.status]}>{STATUS_LABELS[spec.status]}</Chip>
            )}
            {spec.tags?.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPromoteOpen((p) => !p)}
          aria-expanded={promoteOpen}
          className="hds-focus"
          style={cardStyles.promoteBtn}
        >
          {promoteOpen ? 'Cancel' : 'Promote →'}
        </button>
      </header>

      {spec.notes && <p style={cardStyles.notes}>{spec.notes}</p>}

      {promoteOpen && (
        <PromoteForm spec={spec} onCancel={() => setPromoteOpen(false)} onSubmit={handleQueued} />
      )}

      <div style={cardStyles.body}>{spec.render()}</div>
    </article>
  );
}

const cardStyles = {
  // Specimen wrapper is intentionally surface-less so child components that
  // carry their own Surface/Card pop against the page bg. Vertical padding
  // gives breathing room; horizontal stays flush so renderings get full width.
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: `${hds.space.px16} 0`,
    minWidth: 0,
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: hds.space.px12,
    paddingBottom: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    flexWrap: 'wrap' as const,
  },
  headLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    flex: '1 1 auto' as const,
    minWidth: 0,
  },
  name: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  },
  chips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: hds.space.px6,
  },
  promoteBtn: {
    ...hds.typeStyles.ui,
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-accent)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
    flexShrink: 0,
  },
  notes: {
    ...hds.typeStyles.ui,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
    maxWidth: '70ch',
  },
  body: {
    paddingTop: hds.space.px8,
  },
} satisfies Record<string, CSSProperties>;

// ─────────────────────────────────────────────────────────────────────────────
// Promote form (inline, expands within the card)
// ─────────────────────────────────────────────────────────────────────────────

const TIERS: readonly SuggestedTier[] = ['primitive', 'pattern', 'template'];

interface PromoteFormProps {
  spec: Specimen;
  onCancel: () => void;
  onSubmit: (entry: PromotionEntry) => void;
}

function PromoteForm({ spec, onCancel, onSubmit }: PromoteFormProps) {
  const [hdsName, setHdsName] = useState(suggestHdsName(spec.name));
  const [suggestedTier, setSuggestedTier] = useState<SuggestedTier>('pattern');
  const [description, setDescription] = useState(spec.notes ?? '');
  const [notes, setNotes] = useState('');

  function submit() {
    onSubmit({
      id: newEntryId(),
      ts: new Date().toISOString(),
      sourceSpecimen: spec.id,
      family: spec.family,
      source: spec.source,
      tags: spec.tags ?? [],
      hdsName: hdsName.trim(),
      suggestedTier,
      description: description.trim(),
      notes: notes.trim(),
    });
  }

  const canSubmit = hdsName.trim().length > 0;

  return (
    <div style={formStyles.root}>
      <Field label="HDS component name">
        <input
          value={hdsName}
          onChange={(e) => setHdsName(e.target.value)}
          style={formStyles.input}
        />
      </Field>

      <Field label="Target tier">
        <div style={{ display: 'flex', gap: hds.space.px8, flexWrap: 'wrap' }}>
          {TIERS.map((t) => (
            <label
              key={t}
              style={{
                ...hds.typeStyles.ui,
                ...stagingChromeStyles.tierLabelBase,
                background:
                  suggestedTier === t ? 'var(--semantic-color-surface-base)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="tier"
                value={t}
                checked={suggestedTier === t}
                onChange={() => setSuggestedTier(t)}
              />
              {t}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Description">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...formStyles.input, resize: 'vertical' }}
        />
      </Field>

      <Field label="Build-agent notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Constraints, prop hints, edge cases…"
          style={{ ...formStyles.input, resize: 'vertical' }}
        />
      </Field>

      <div style={formStyles.actions}>
        <button
          type="button"
          onClick={onCancel}
          className="hds-focus"
          style={formStyles.btnSecondary}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="hds-focus"
          style={{
            ...formStyles.btnPrimary,
            opacity: canSubmit ? 1 : 0.5,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          Add to queue
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={formStyles.field}>
      <span style={formStyles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function suggestHdsName(specimenName: string): string {
  // "External resource card" → "ResourceCard"; strip articles/prepositions; PascalCase.
  const stop = new Set(['the', 'a', 'an', 'of', 'with', 'and', 'for', 'in', 'on']);
  const words = specimenName
    .replace(/[()/]/g, ' ')
    .split(/[\s—·-]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0 && !stop.has(w));
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

const formStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: hds.space.px12,
    background: 'var(--semantic-color-surface-base)',
    borderRadius: hds.borderRadius[8],
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
  },
  fieldLabel: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
  },
  input: {
    ...hds.typeStyles.body,
    padding: `${hds.space.px6} ${hds.space.px8}`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.sm,
    fontFamily: 'inherit',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: hds.space.px8,
    paddingTop: hds.space.px4,
  },
  btnSecondary: {
    ...hds.typeStyles.ui,
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
  },
  btnPrimary: {
    ...hds.typeStyles.ui,
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-base)',
    border: '1px solid var(--semantic-color-content-accent)',
    borderRadius: hds.borderRadius.md,
  },
} satisfies Record<string, CSSProperties>;

// ─────────────────────────────────────────────────────────────────────────────
// Filter bar — search + chips + sort
// ─────────────────────────────────────────────────────────────────────────────

export type SortMode = 'newest' | 'family' | 'status';

export interface FilterState {
  search: string;
  families: Set<SpecimenFamily>;
  sources: Set<string>;
  statuses: Set<SpecimenStatus>;
  sort: SortMode;
}

export function emptyFilters(): FilterState {
  return {
    search: '',
    families: new Set(),
    sources: new Set(),
    statuses: new Set(),
    sort: 'family',
  };
}

interface FilterBarProps {
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  allFamilies: readonly SpecimenFamily[];
  allSources: readonly string[];
  matchedCount: number;
  totalCount: number;
}

export function FilterBar({
  filters,
  setFilters,
  allFamilies,
  allSources,
  matchedCount,
  totalCount,
}: FilterBarProps) {
  return (
    <div style={filterStyles.root}>
      <div style={filterStyles.row}>
        <input
          type="search"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          placeholder={`Search ${totalCount} specimens…`}
          style={filterStyles.search}
        />
        <select
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortMode })}
          style={filterStyles.select}
        >
          <option value="family">Sort: by family</option>
          <option value="newest">Sort: newest first</option>
          <option value="status">Sort: by status</option>
        </select>
      </div>

      <ChipFilterGroup
        label="Family"
        options={allFamilies.map((f) => ({ value: f, label: FAMILY_LABELS[f] }))}
        selected={filters.families as Set<string>}
        onToggle={(v) =>
          setFilters({ ...filters, families: toggleSet(filters.families, v as SpecimenFamily) })
        }
      />

      <ChipFilterGroup
        label="Source"
        options={allSources.map((src) => ({ value: src, label: src }))}
        selected={filters.sources}
        onToggle={(v) => setFilters({ ...filters, sources: toggleSet(filters.sources, v) })}
      />

      <ChipFilterGroup
        label="Status"
        options={(['draft', 'review', 'approved', 'archived'] as SpecimenStatus[]).map((s) => ({
          value: s,
          label: STATUS_LABELS[s],
        }))}
        selected={filters.statuses as Set<string>}
        onToggle={(v) =>
          setFilters({ ...filters, statuses: toggleSet(filters.statuses, v as SpecimenStatus) })
        }
      />

      <div style={filterStyles.summary}>
        <span style={filterStyles.summaryText}>
          {matchedCount === totalCount
            ? `${totalCount} specimens`
            : `${matchedCount} of ${totalCount} match`}
        </span>
        {filters.search ||
        filters.families.size ||
        filters.sources.size ||
        filters.statuses.size ? (
          <button
            type="button"
            onClick={() => setFilters(emptyFilters())}
            style={filterStyles.clearBtn}
            className="hds-focus"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

interface ChipFilterGroupProps {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}

function ChipFilterGroup({ label, options, selected, onToggle }: ChipFilterGroupProps) {
  if (options.length === 0) return null;
  return (
    <div style={filterStyles.chipRow}>
      <span style={filterStyles.chipRowLabel}>{label}</span>
      <div style={filterStyles.chipRowChips}>
        {options.map((opt) => {
          const active = selected.has(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              aria-pressed={active}
              className="hds-focus"
              style={{
                ...hds.typeStyles.ui,
                ...stagingChromeStyles.filterChipBtnBase,
                background: active
                  ? 'var(--semantic-color-content-accent)'
                  : 'var(--semantic-color-surface-raised)',
                color: active
                  ? 'var(--semantic-color-surface-base)'
                  : 'var(--semantic-color-content-primary)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const filterStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: hds.space.px16,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[8],
  },
  row: {
    display: 'flex',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  search: {
    ...hds.typeStyles.body,
    flex: '1 1 240px' as const,
    minWidth: 0,
    padding: `${hds.space.px6} ${hds.space.px8}`,
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    fontFamily: 'inherit',
  },
  select: {
    ...hds.typeStyles.ui,
    padding: `${hds.space.px6} ${hds.space.px8}`,
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    fontFamily: 'inherit',
  },
  chipRow: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  chipRowLabel: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    flexShrink: 0,
    width: '4.5rem',
  },
  chipRowChips: {
    display: 'flex',
    gap: hds.space.px4,
    flexWrap: 'wrap' as const,
  },
  summary: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px8,
    paddingTop: hds.space.px4,
  },
  summaryText: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
  },
  clearBtn: {
    ...hds.typeStyles.ui,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    background: 'transparent',
    color: 'var(--semantic-color-content-accent)',
    border: 'none',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;

// ─────────────────────────────────────────────────────────────────────────────
// Queue bar — collapsible queue review + JSON export
// ─────────────────────────────────────────────────────────────────────────────

interface QueueBarProps {
  queue: PromotionEntry[];
  onChange: (next: PromotionEntry[]) => void;
}

export function QueueBar({ queue, onChange }: QueueBarProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'idle' | 'success' | 'fail'>('idle');

  if (queue.length === 0 && !open) return null;

  async function handleCopy() {
    const ok = await copyQueueAsJson(queue);
    setCopied(ok ? 'success' : 'fail');
    setTimeout(() => setCopied('idle'), 2000);
  }

  function handleClear() {
    if (window.confirm(`Clear all ${queue.length} queued promotions?`)) {
      onChange([]);
    }
  }

  function handleRemove(id: string) {
    onChange(removeFromQueue(id));
  }

  return (
    <section style={queueStyles.root}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-expanded={open}
        className="hds-focus"
        style={queueStyles.head}
      >
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            transition: `transform ${hds.duration.fast} ease-out`,
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        />
        <span style={queueStyles.headLabel}>Promotion queue</span>
        <Chip tone={queue.length > 0 ? 'info' : 'subdued'}>{queue.length}</Chip>
      </button>

      {open && queue.length === 0 && (
        <p style={queueStyles.empty}>
          Queue is empty. Click &quot;Promote →&quot; on any specimen to add an entry.
        </p>
      )}

      {open && queue.length > 0 && (
        <>
          <div style={queueStyles.list}>
            {queue.map((e) => (
              <div key={e.id} style={queueStyles.item}>
                <div style={queueStyles.itemText}>
                  <span style={queueStyles.itemName}>{e.hdsName}</span>
                  <Chip>{e.suggestedTier}</Chip>
                  <span style={queueStyles.itemMeta}>← {e.sourceSpecimen}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(e.id)}
                  aria-label="Remove from queue"
                  className="hds-focus"
                  style={queueStyles.iconBtn}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={queueStyles.actions}>
            <button
              type="button"
              onClick={handleCopy}
              className="hds-focus"
              style={queueStyles.copyBtn}
            >
              <Copy size={14} aria-hidden="true" />
              {copied === 'success' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy JSON'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="hds-focus"
              style={queueStyles.clearBtn}
            >
              <Trash2 size={14} aria-hidden="true" />
              Clear
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const queueStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: hds.space.px12,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[8],
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left' as const,
    color: 'inherit',
  },
  headLabel: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    flex: '1 1 auto' as const,
  },
  empty: {
    ...hds.typeStyles.ui,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px8,
    padding: `${hds.space.px6} ${hds.space.px8}`,
    background: 'var(--semantic-color-surface-base)',
    borderRadius: hds.borderRadius.md,
  },
  itemText: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    minWidth: 0,
    overflow: 'hidden',
  },
  itemName: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  itemMeta: {
    ...hds.typeStyles.mono,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: 'var(--semantic-color-content-secondary)',
    cursor: 'pointer',
    padding: hds.space.px4,
  },
  actions: {
    display: 'flex',
    gap: hds.space.px8,
    justifyContent: 'flex-end',
    paddingTop: hds.space.px4,
  },
  copyBtn: {
    ...hds.typeStyles.ui,
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px4,
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-base)',
    border: 'none',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
  },
  clearBtn: {
    ...hds.typeStyles.ui,
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px4,
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>;
