/**
 * RepoFilter — scope every issue and PR lane on /ops/standing to one repo.
 * ~200 open issues from a dozen repos read as one pile; this is the handle on
 * it: one chip per repo the loaded sweep holds (see repoScope), busiest first.
 *
 * Built on the design system's `Tag` ("interactive filter and category chip":
 * `aria-pressed`, the `hds-focus` ring; /ops/digest uses it too). A
 * `SegmentedControl` rail cannot fit a dozen repos at 375px, and a select
 * hides the counts — which are what make the pile navigable — behind a tap.
 *
 * Phone-first: the row scrolls sideways inside its own box instead of wrapping
 * or widening the page, and keeps the pressed chip in view.
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Tag } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { RepoAmbiguity, RepoOption } from './repoScope';

interface RepoFilterProps {
  /** Busiest first — rendered in the order given. */
  options: RepoOption[];
  /** Full `owner/repo` of the selected option, or null for all repos. */
  selected: string | null;
  /** A `?repo=` value that matched nothing, so the page fell back to all repos. */
  unknown: string | null;
  /** A short `?repo=` value several repos share, so the page fell back to all repos. */
  ambiguous: RepoAmbiguity | null;
  /**
   * Receives the option's `param`, or null for All repos. Never the current
   * choice — but All repos is not "current" while a stray `?repo=` is still in
   * the URL, even though every repo is showing: tapping it is how the operator
   * clears that param and its note.
   */
  onSelect: (param: string | null) => void;
}

export function RepoFilter({ options, selected, unknown, ambiguous, onSelect }: RepoFilterProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const total = options.reduce((sum, o) => sum + o.count, 0);

  // Keep the pressed chip inside the scroll box — by moving the box, not the
  // page, so a background poll can never yank the window sideways or down.
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !chip) return;
    const left = chip.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < row.scrollLeft || right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = left - (row.clientWidth - chip.offsetWidth) / 2;
    }
  }, [selected, options.length]);

  const pick = (param: string | null, isCurrent: boolean) => () => {
    if (!isCurrent) onSelect(param);
  };

  return (
    <div style={s.wrap}>
      {/* Nothing open anywhere means nothing to filter — a lone "All repos 0"
          chip would be a control with no job. */}
      {options.length ? (
        <div ref={rowRef} role="group" aria-label="Filter lanes by repo" style={s.row}>
          <Chip
            label="All repos"
            count={total}
            detail={`${total} open`}
            active={selected === null}
            onClick={pick(null, selected === null && unknown === null && ambiguous === null)}
          />
          {options.map((o) => (
            <Chip
              key={o.repo}
              label={o.param}
              count={o.count}
              detail={`${o.count} open — ${plural(o.issues, 'issue')}, ${plural(o.prs, 'PR')}`}
              active={selected === o.repo}
              onClick={pick(o.param, selected === o.repo)}
            />
          ))}
        </div>
      ) : null}
      {unknown !== null ? (
        <p role="status" style={s.note}>
          Nothing open in “{unknown}” — showing all repos.
        </p>
      ) : ambiguous !== null ? (
        <p role="status" style={s.note}>
          “{ambiguous.given}” matches {sentenceList(ambiguous.repos)} — pick one. Showing all repos.
        </p>
      ) : null}
    </div>
  );
}

function Chip({
  label,
  count,
  detail,
  active,
  onClick,
}: {
  label: string;
  count: number;
  detail: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Tag active={active} onClick={onClick} aria-label={`${label} ${detail}`} style={s.chip}>
      <span>{label}</span>
      <span style={s.count}>{count}</span>
    </Tag>
  );
}

/** `a`, `a and b`, `a, b and c`. */
function sentenceList(items: string[]): string {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

const s = {
  wrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    minWidth: 0,
  },
  row: {
    // `position: relative` makes each chip's offsetLeft relative to this box,
    // which is what the scroll-into-view effect measures against.
    position: 'relative' as const,
    display: 'flex',
    flexWrap: 'nowrap' as const,
    alignItems: 'center',
    gap: hds.space.px6,
    overflowX: 'auto' as const,
    overscrollBehaviorX: 'contain' as const,
    scrollbarWidth: 'thin' as const,
    // Room inside the scroll box for the 2px-offset focus ring, which the
    // overflow would otherwise clip.
    padding: hds.space.px4,
    minWidth: 0,
  },
  chip: {
    minHeight: hds.size.interactive.min,
    flexShrink: 0,
  },
  count: {
    marginLeft: hds.space.px6,
    fontVariantNumeric: 'tabular-nums',
  },
  note: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  },
} satisfies Record<string, CSSProperties>;
