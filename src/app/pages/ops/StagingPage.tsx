/* hds-bypass: ops-internal staging surface — inline styles intentional. */
/* eslint-disable react-hooks/set-state-in-effect -- localStorage queue hydration on mount is intentional */

/**
 * StagingPage — `/ops/staging`. Persistent specimen surface. Catalog of
 * visual patterns under evaluation, grouped by family. New patterns get
 * dropped in to `staging/specimens.tsx` as additional `Specimen` entries
 * for visual review before they're ingested into HDS proper or discarded.
 *
 * Surface flow:
 *   1. PageHeader        locked-down chrome
 *   2. FilterBar         search · family · source · status · sort
 *   3. QueueBar          collapsible promotion queue (localStorage) + JSON export
 *   4. Family groups     each specimen rendered inside a SpecimenCard
 *
 * Adding specimens: append to `SPECIMENS` in `./staging/specimens.tsx`.
 * No chrome changes needed — the filter bar autopopulates from the data.
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { Page } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from './PageHeader';

import { FAMILY_LABELS, FAMILY_ORDER, type Specimen, type SpecimenFamily } from './staging/types';
import { SPECIMENS } from './staging/specimens';
import {
  emptyFilters,
  FilterBar,
  QueueBar,
  SpecimenCard,
  type FilterState,
} from './staging/StagingChrome';
import { loadQueue, type PromotionEntry } from './staging/promote-queue';

// ─────────────────────────────────────────────────────────────────────────────
// Filtering + sorting
// ─────────────────────────────────────────────────────────────────────────────

function matchesFilters(spec: Specimen, f: FilterState): boolean {
  if (f.families.size > 0 && !f.families.has(spec.family)) return false;
  if (f.sources.size > 0 && !f.sources.has(spec.source)) return false;
  if (f.statuses.size > 0) {
    if (!spec.status || !f.statuses.has(spec.status)) return false;
  }
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [spec.name, spec.notes ?? '', spec.source, spec.family, ...(spec.tags ?? [])]
      .join(' ')
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function compareSpecimens(a: Specimen, b: Specimen, sort: FilterState['sort']): number {
  if (sort === 'newest') {
    const aT = a.added ?? '';
    const bT = b.added ?? '';
    if (aT !== bT) return bT.localeCompare(aT);
  } else if (sort === 'family') {
    const aI = FAMILY_ORDER.indexOf(a.family);
    const bI = FAMILY_ORDER.indexOf(b.family);
    if (aI !== bI) return aI - bI;
  } else if (sort === 'status') {
    const order = ['draft', 'review', 'approved', 'archived'];
    const aI = a.status ? order.indexOf(a.status) : 999;
    const bI = b.status ? order.indexOf(b.status) : 999;
    if (aI !== bI) return aI - bI;
  }
  return a.name.localeCompare(b.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function StagingPage() {
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters());
  const [queue, setQueue] = useState<PromotionEntry[]>([]);

  // Hydrate queue from localStorage on mount.
  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  const allFamilies = useMemo<readonly SpecimenFamily[]>(() => {
    const present = new Set(SPECIMENS.map((s) => s.family));
    return FAMILY_ORDER.filter((f) => present.has(f));
  }, []);

  const allSources = useMemo<readonly string[]>(() => {
    return Array.from(new Set(SPECIMENS.map((s) => s.source))).sort();
  }, []);

  const filtered = useMemo(() => {
    return SPECIMENS.filter((s) => matchesFilters(s, filters))
      .slice()
      .sort((a, b) => compareSpecimens(a, b, filters.sort));
  }, [filters]);

  // Group by family when sorting by family — otherwise render flat list.
  const grouped = useMemo<{ family: SpecimenFamily | null; items: Specimen[] }[]>(() => {
    if (filters.sort !== 'family') return [{ family: null, items: filtered }];
    const groups: { family: SpecimenFamily | null; items: Specimen[] }[] = [];
    for (const f of FAMILY_ORDER) {
      const items = filtered.filter((s) => s.family === f);
      if (items.length > 0) groups.push({ family: f, items });
    }
    return groups;
  }, [filtered, filters.sort]);

  return (
    <Page>
      <div style={s.root}>
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Staging' }]}
          title="Staging"
          lede="Specimen surface for visual patterns under evaluation. Filter, sort, and promote keepers into HDS."
        />

        <FilterBar
          filters={filters}
          setFilters={setFilters}
          allFamilies={allFamilies}
          allSources={allSources}
          matchedCount={filtered.length}
          totalCount={SPECIMENS.length}
        />

        <QueueBar queue={queue} onChange={setQueue} />

        {filtered.length === 0 ? (
          <p style={s.empty}>No specimens match the current filters.</p>
        ) : (
          grouped.map((group, gi) => (
            <section key={group.family ?? `flat-${gi}`} style={s.familySection}>
              {group.family && (
                <div style={s.familyHead}>
                  <span style={s.familyKicker}>{FAMILY_LABELS[group.family]}</span>
                  <span style={s.familyCount}>{group.items.length}</span>
                </div>
              )}
              <div style={s.familyBody}>
                {group.items.map((spec) => (
                  <SpecimenCard key={spec.id} spec={spec} onQueued={() => setQueue(loadQueue())} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Page>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px24,
  },
  familySection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
  },
  familyHead: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    paddingBottom: hds.space.px4,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  familyKicker: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    flex: '1 1 auto' as const,
  },
  familyCount: {
    ...hds.typeStyles.mono,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  familyBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px16,
  },
  empty: {
    ...hds.typeStyles.body,
    margin: 0,
    padding: `${hds.space.px24} 0`,
    color: 'var(--semantic-color-content-secondary)',
    textAlign: 'center' as const,
  },
} satisfies Record<string, CSSProperties>;
