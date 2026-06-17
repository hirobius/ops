/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

/**
 * ClientsIndexPage — /ops/clients
 *
 * Clients + prospects grid lifted out of the legacy OpsDashboardPage as part of
 * unit 13w-ops-6. The pipeline-summary tiles come along because they roll up
 * client-side numbers (blockers, open tasks, retainer total). Services /
 * packages content stays in OpsDashboardPage — different concern.
 *
 * @category Internal
 * @tier utility
 */

import React from 'react';
import type { CSSProperties } from 'react';

import { Page } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { Card } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import { Stat } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from './PageHeader';

import type { ClientFiles } from './clientTypes';
import { CLIENT_REGISTRY } from './clientRegistry';

// ── Tone helper ───────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';

function phaseStatusTone(s: string): BadgeTone {
  if (s === 'in-progress') return 'warning';
  if (s === 'done') return 'success';
  if (s === 'blocked') return 'danger';
  return 'neutral';
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
  };
}

const ALL_CARDS = Object.entries(CLIENT_REGISTRY).map(([slug, files]) => deriveCard(slug, files));
const CLIENTS = ALL_CARDS.filter((c) => c.status === 'active');
const PROSPECTS = ALL_CARDS.filter((c) => c.status === 'prospect');

// ── Page ──────────────────────────────────────────────────────────────────────

/** @public */
export default function ClientsIndexPage() {
  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Clients' }]}
          title="Clients"
          lede={`Active retainers and prospects — ${CLIENTS.length} active, ${PROSPECTS.length} prospect.`}
        />

        {/* Clients */}
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

        {/* Prospects */}
        {PROSPECTS.length > 0 && (
          <section>
            <h2 style={s.sectionTitle}>Prospects</h2>
            <div style={s.clientGrid}>
              {PROSPECTS.map((c) => (
                <ClientRow key={c.slug} client={c} />
              ))}
            </div>
          </section>
        )}

        {/* Pipeline summary */}
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
      </Stack>
    </Page>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ClientRow({ client: c }: { client: ClientCard }) {
  const isProspect = c.status === 'prospect';
  return (
    <Card
      as="a"
      {...({ href: `/ops/clients/${c.slug}` } as React.HTMLAttributes<HTMLDivElement>)}
      padding="none"
      style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
      tone="default"
    >
      <Card.Header
        metadata={
          <Badge tone={isProspect ? 'info' : phaseStatusTone(c.phaseStatus)}>
            {isProspect ? 'pre-consult' : c.phaseStatus}
          </Badge>
        }
      >
        <Card.Title>{c.name}</Card.Title>
        <Card.Description>
          {c.location} · {c.primaryContact}
        </Card.Description>
      </Card.Header>
      <Card.Body>
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
                tone={c.blockerCount > 0 ? 'danger' : 'default'}
              />
            </>
          )}
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
      <Card.Metric label={label} value={value} sub={note} tone={highlight ? 'danger' : 'default'} />
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
  subtitle: { ...hds.typeStyles.body, margin: 0, color: 'var(--semantic-color-content-secondary)' },

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
