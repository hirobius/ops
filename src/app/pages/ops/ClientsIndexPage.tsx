/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

/**
 * ClientsIndexPage — /ops/clients
 *
 * Clients + prospects grid lifted out of the legacy OpsDashboardPage as part of
 * unit 13w-ops-6. The pipeline-summary tiles come along because they roll up
 * client-side numbers (blockers, open tasks, retainer total). Services /
 * packages content stays in OpsDashboardPage — different concern.
 *
 * Each card links out to what the client can actually see: their **Portal**
 * (`meta.portalUrl.prod`) and their **Live site** (`meta.website`), greyed when
 * absent so a gap reads at a glance. Service tags (`meta.services`) show what
 * we're doing for them. A committed "Samples & demos" section (see `demos.ts`)
 * showcases concept builds that aren't clients.
 *
 * Client records come from the private client store (GET /api/clients via
 * useClientRegistry), not from files in this repo. Until the store has answered
 * (loading, or unreachable) the Active / Prospects / Pipeline sections are not
 * rendered at all: "0 active · $0 retainer" under an error reads as real
 * figures. A reachable-but-empty store is a real zero and does render them.
 *
 * @category Internal
 * @tier utility
 */

import React, { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';

import { Page, Stack, Card, Badge, Stat } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { usePoll } from '../../lib/usePoll';
import { PageHeader } from './PageHeader';
// Reuse Standing's fleet fetch so the funnel is DERIVED from live leads row
// counts, never hand-written. (It's the heavier /api/tasks?fleet=1 read; a light
// /api/leads?funnel=1 mode would be a cheaper follow-up if this page gets hot.)
import { fetchFleetStatus, type FleetStatus } from './ralphStatus';

import type { ClientFiles } from './clientTypes';
import { useClientRegistry } from './clientRegistry';
import { ClientStoreDrift, ClientStoreStatus } from './ClientStoreNotice';
import { DEMOS, type DemoBuild } from './demos';

// ── Tone helpers ──────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';

function phaseStatusTone(s: string): BadgeTone {
  if (s === 'in-progress') return 'warning';
  if (s === 'done') return 'success';
  if (s === 'blocked') return 'danger';
  return 'neutral';
}

/** Color-map for the known service tags; anything else is neutral. */
function serviceTone(svc: string): BadgeTone {
  switch (svc.toLowerCase()) {
    case 'automation':
      return 'success';
    case 'marketing':
    case 'seo':
      return 'info';
    case 'ads':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** A URL is renderable only if it's a real http(s) link (not a `<<placeholder>>`). */
function usableUrl(url?: string): string | undefined {
  return url && /^https?:\/\//.test(url) && !url.includes('<<') ? url : undefined;
}

// ── Card derivation (kept inline — only ClientsIndexPage consumes it today) ───

interface ClientCard {
  slug: string;
  name: string;
  location: string;
  phase: string;
  phaseStatus: string;
  retainerAmount: number;
  retainerStatus: string;
  blockerCount: number;
  openTaskCount: number;
  primaryContact: string;
  status: string;
  estimatedScope?: string;
  services: string[];
  portalUrl?: string;
  website?: string;
}

function deriveCard(slug: string, { meta, tasks, retainer, checklist }: ClientFiles): ClientCard {
  const allTasks = (tasks?.phases ?? []).flatMap((p) =>
    (p.swimlanes ?? []).flatMap((l) => l.tasks ?? []),
  );
  const openTasks = allTasks.filter((t) => t.status !== 'done' && t.status !== 'complete');
  const blockers = (checklist?.categories ?? [])
    .flatMap((c) => c.items ?? [])
    .filter((i) => i.status === 'blocked');
  const curPhase =
    (tasks?.phases ?? []).find((p) => p.status === 'in-progress') ?? tasks?.phases?.[0];
  const portal = meta.portalUrl?.prod ?? meta.portalUrl?.staging ?? meta.portalUrl?.draft;
  return {
    slug,
    name: meta.name ?? slug,
    location: meta.location ?? '—',
    phase: curPhase?.name ?? '—',
    phaseStatus: curPhase?.status ?? 'planned',
    retainerAmount: retainer?.currentPhase?.scopedAt ?? 0,
    retainerStatus: retainer?.currentPhase?.status ?? '—',
    blockerCount: blockers.length,
    openTaskCount: openTasks.length,
    primaryContact: meta.contact?.name ?? '—',
    status: meta.status ?? 'unknown',
    estimatedScope: retainer?.estimatedScope,
    services: meta.services ?? [],
    portalUrl: usableUrl(portal),
    website: usableUrl(meta.website),
  };
}

/** Split the registry into cards (scaffold `_` slugs are already filtered by the registry). */
function cardsOf(registry: Record<string, ClientFiles>) {
  const all = Object.entries(registry)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, files]) => deriveCard(slug, files));
  return {
    ALL_CARDS: all,
    CLIENTS: all.filter((c) => c.status === 'active'),
    PROSPECTS: all.filter((c) => c.status === 'prospect'),
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** @public */
export default function ClientsIndexPage() {
  const clientStore = useClientRegistry();
  const { registry } = clientStore;
  const { ALL_CARDS, CLIENTS, PROSPECTS } = useMemo(() => cardsOf(registry ?? {}), [registry]);
  const counts = registry
    ? ` — ${CLIENTS.length} active, ${PROSPECTS.length} prospect, ${DEMOS.length} demos`
    : '';

  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Clients' }]}
          title="Clients"
          lede={`Active retainers, prospects & sample builds${counts}.`}
        />

        {/* Client records are read from the private store — loading, unavailable
            (with the fix), empty-store and (dev) local-drift states. */}
        <ClientStoreStatus state={clientStore} />
        <ClientStoreDrift state={clientStore} />

        {/* Lead funnel — the tier upstream of clients (Supabase leads), so the
            whole picture (leads → prospects → clients) reads in one place. */}
        <LeadFunnelStrip />

        {/* Active clients — only once the store has answered. */}
        {registry && (
          <section>
            <div style={s.sectionHead}>
              <h2 style={s.sectionTitle}>Active</h2>
              <a href="/ops/clients/new" style={s.addLink}>
                + New client
              </a>{' '}
              {/* route-ok: scaffold-new-client page is planned, see ops-dashboard backlog */}
            </div>
            <div style={s.clientGrid}>
              {CLIENTS.map((c) => (
                <ClientRow key={c.slug} client={c} />
              ))}
              <NewClientSlot />
            </div>
          </section>
        )}

        {/* Prospects */}
        {registry && PROSPECTS.length > 0 && (
          <section>
            <h2 style={s.sectionTitle}>Prospects</h2>
            <div style={s.clientGrid}>
              {PROSPECTS.map((c) => (
                <ClientRow key={c.slug} client={c} />
              ))}
            </div>
          </section>
        )}

        {/* Samples & demos — committed showcase, not clients (see demos.ts) */}
        {DEMOS.length > 0 && (
          <section>
            <h2 style={s.sectionTitle}>Samples &amp; demos</h2>
            <p style={s.subtitle}>Concept builds and sample sites — not clients.</p>
            <div style={s.clientGrid}>
              {DEMOS.map((d) => (
                <DemoRow key={d.slug} demo={d} />
              ))}
            </div>
          </section>
        )}

        {/* Pipeline summary — derived from the store, so absent until it answers. */}
        {registry && (
          <section>
            <h2 style={s.sectionTitle}>Pipeline</h2>
            <div style={s.pipelineGrid}>
              <PipelineCard label="Active Clients" value={String(CLIENTS.length)} />
              <PipelineCard
                label="Open Tasks"
                value={String(ALL_CARDS.reduce((a, c) => a + c.openTaskCount, 0))}
              />
              <PipelineCard
                label="Blockers"
                value={String(ALL_CARDS.reduce((a, c) => a + c.blockerCount, 0))}
                highlight={ALL_CARDS.some((c) => c.blockerCount > 0)}
              />
              <PipelineCard
                label="Retainer Value"
                value={`$${CLIENTS.reduce((a, c) => a + c.retainerAmount, 0).toLocaleString()}`}
              />
              <PipelineCard
                label="Prospects"
                value={String(PROSPECTS.length)}
                note={PROSPECTS.map((p) => p.name).join(', ')}
              />
            </div>
          </section>
        )}
      </Stack>
    </Page>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** An external link rendered as a pill, or a greyed "No …" when absent. */
function LinkSlot({ label, href }: { label: string; href?: string }) {
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="hds-focus" style={s.linkPill}>
        {label} ↗
      </a>
    );
  }
  return <span style={s.linkPillMuted}>No {label.toLowerCase()}</span>;
}

function ServiceTags({ services }: { services: string[] }) {
  if (services.length === 0) return null;
  return (
    <div style={s.tagRow}>
      {services.map((sv) => (
        <Badge key={sv} tone={serviceTone(sv)}>
          {sv}
        </Badge>
      ))}
    </div>
  );
}

function fmtCount(v: number | null | undefined): string {
  return v == null ? '—' : String(v);
}

// Live lead funnel — Supabase row counts via the shared fleet read, so the tier
// upstream of clients is visible in one place. Derived, never hand-written.
function LeadFunnelStrip() {
  const { data } = usePoll<FleetStatus>(fetchFleetStatus, { intervalMs: 60000 });
  const f = data?.funnel ?? {};
  const steps: { label: string; value: number | null | undefined; href: string }[] = [
    { label: 'Sourced', value: f['sourced'], href: '/ops/leads' },
    { label: 'Qualified', value: f['qualified'], href: '/ops/leads' },
    { label: 'Pitch-ready', value: f['published'], href: '/ops/pitch' },
    { label: 'Contacted', value: f['contacted'], href: '/ops/pitch' },
  ];
  return (
    <section>
      <div style={s.sectionHead}>
        <h2 style={s.sectionTitle}>Lead funnel</h2>
        <Link to="/ops/standing" style={s.addLink}>
          Full board →
        </Link>
      </div>
      <div style={s.funnelRow}>
        {steps.map((st, i) => (
          <React.Fragment key={st.label}>
            <Link to={st.href} className="hds-focus" style={s.funnelStep}>
              <span style={s.funnelValue}>{fmtCount(st.value)}</span>
              <span style={s.funnelLabel}>{st.label}</span>
            </Link>
            {i < steps.length - 1 ? (
              <span aria-hidden="true" style={s.funnelArrow}>
                →
              </span>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function ClientRow({ client: c }: { client: ClientCard }) {
  const isProspect = c.status === 'prospect';
  return (
    <Card padding="none" tone="neutral">
      <Card.Header
        metadata={
          <Badge tone={isProspect ? 'info' : phaseStatusTone(c.phaseStatus)}>
            {isProspect ? 'pre-consult' : c.phaseStatus}
          </Badge>
        }
      >
        <Card.Title>
          <Link to={`/ops/clients/${c.slug}`} style={s.titleLink}>
            {c.name}
          </Link>
        </Card.Title>
        <Card.Description>
          {c.location} · {c.primaryContact}
        </Card.Description>
      </Card.Header>
      <Card.Body>
        <ServiceTags services={c.services} />
        <p
          style={{
            ...hds.typeStyles.small,
            color: 'var(--semantic-color-content-secondary)',
            margin: 0,
          }}
        >
          {c.phase}
        </p>
      </Card.Body>
      <Card.Footer>
        <div style={s.linkRow}>
          <LinkSlot label="Portal" href={c.portalUrl} />
          <LinkSlot label="Live site" href={c.website} />
        </div>
        <div
          style={{ display: 'flex', gap: 'var(--semantic-space-layout-normal)', flexWrap: 'wrap' }}
        >
          {isProspect ? (
            <>
              <Stat label="Est. scope" value={c.estimatedScope ?? '—'} />
              <Stat label="Open tasks" value={String(c.openTaskCount)} />
            </>
          ) : (
            <>
              <Stat
                label="Retainer"
                value={`$${c.retainerAmount.toLocaleString()}`}
                sub={c.retainerStatus}
              />
              <Stat label="Open tasks" value={String(c.openTaskCount)} />
              <Stat
                label="Blockers"
                value={String(c.blockerCount)}
                tone={c.blockerCount > 0 ? 'danger' : 'neutral'}
              />
            </>
          )}
        </div>
      </Card.Footer>
    </Card>
  );
}

function DemoRow({ demo }: { demo: DemoBuild }) {
  return (
    <Card padding="none" tone="neutral">
      <Card.Header metadata={<Badge tone="neutral">demo</Badge>}>
        <Card.Title>{demo.name}</Card.Title>
        <Card.Description>{demo.vertical}</Card.Description>
      </Card.Header>
      <Card.Body>
        <ServiceTags services={demo.services ?? []} />
        {demo.note ? (
          <p
            style={{
              ...hds.typeStyles.small,
              color: 'var(--semantic-color-content-secondary)',
              margin: 0,
            }}
          >
            {demo.note}
          </p>
        ) : null}
      </Card.Body>
      <Card.Footer>
        <div style={s.linkRow}>
          <LinkSlot label="Live demo" href={usableUrl(demo.url)} />
        </div>
      </Card.Footer>
    </Card>
  );
}

function NewClientSlot() {
  return (
    <a
      href="/ops/clients/new" /* route-ok: scaffold-new-client page is planned, see ops-dashboard backlog */
      className="hds-focus"
      // outline-ok: interactive ghost slot (dashed border)
      style={{ ...s.newClientSlot, border: '1px dashed var(--semantic-color-border-subdued)' }}
    >
      <p style={s.newSlotLabel}>+ Add client</p>
      <p style={s.newSlotSub}>Start from template</p>
    </a>
  );
}

function PipelineCard({
  label,
  value,
  highlight,
  note,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  note?: string;
}) {
  return (
    <Card padding="none">
      <Card.Metric label={label} value={value} sub={note} tone={highlight ? 'danger' : 'neutral'} />
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  header: {
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.semantic.space.section.inset,
  },
  pageTitle: {
    ...hds.typeStyles.h1,
    margin: `0 0 ${hds.space.px8}`,
    color: 'var(--semantic-color-content-primary)',
  },
  subtitle: {
    ...hds.typeStyles.body,
    margin: `0 0 ${hds.semantic.space.component.gap}`,
    color: 'var(--semantic-color-content-secondary)',
  },

  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: hds.semantic.space.component.gap,
    flexWrap: 'wrap' as const,
    gap: hds.semantic.space.component.gap,
  },
  sectionTitle: {
    ...hds.typeStyles.h2,
    margin: `0 0 ${hds.semantic.space.component.gap}`,
    color: 'var(--semantic-color-content-primary)',
  },
  addLink: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none' as const,
  },
  titleLink: { color: 'inherit', textDecoration: 'none' as const },

  funnelRow: {
    display: 'flex',
    alignItems: 'stretch',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  funnelStep: {
    flex: '1 1 120px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    padding: `${hds.space.px12} ${hds.space.px16}`,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[8],
    textDecoration: 'none' as const,
    color: 'inherit',
    minWidth: 0,
  },
  funnelValue: {
    ...hds.typeStyles.h2,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  funnelLabel: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  funnelArrow: { alignSelf: 'center' as const, color: 'var(--semantic-color-content-secondary)' },

  clientGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))',
    gap: hds.semantic.space.component.gap,
  },
  pipelineGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))',
    gap: hds.semantic.space.component.gap,
  },

  tagRow: {
    display: 'flex',
    gap: hds.space.px4,
    flexWrap: 'wrap' as const,
    marginBottom: hds.space.px8,
  },
  linkRow: {
    display: 'flex',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
    marginBottom: hds.semantic.space.component.gap,
  },
  linkPill: {
    ...hds.typeStyles.ui,
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px4,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none' as const,
  },
  linkPillMuted: {
    ...hds.typeStyles.ui,
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px4,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    opacity: 0.55,
    cursor: 'default' as const,
  },

  newSlotLabel: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    margin: `0 0 ${hds.space.px4}`,
  },
  newSlotSub: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', margin: 0 },
  newClientSlot: {
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '140px',
    padding: hds.semantic.space.section.inset,
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
  },
} satisfies Record<string, CSSProperties>;
