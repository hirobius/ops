/* eslint-disable no-restricted-syntax */
/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import React from 'react';
import type { CSSProperties } from 'react';
import { ExternalLink } from 'lucide-react';
import { Page, Surface, Stack, Card, Badge, Stat } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import legacyTaskArchive from '../../../../docs/ai/_archive/legacy-task-systems-2026-05-11.json';
const orchestration = legacyTaskArchive.sources.orchestration;
import { PageHeader } from './PageHeader';
import { SecurityPostureWidget } from './SecurityPostureWidget';
import { SessionsSection } from './SessionsSection';

// 12d-card-anatomy: domain phase status → Badge tone. Owns the mapping;
// the renderer is the canonical primitive so phase badges look identical
// across every dashboard surface.
type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';
function phaseStatusTone(s: string): BadgeTone {
  if (s === 'in-progress') return 'warning';
  if (s === 'done') return 'success';
  if (s === 'blocked') return 'danger';
  return 'neutral';
}

// ── Manifest-driven client registry (auto-discovers all clients/*/meta.json) ──

import type { ClientFiles } from './clientTypes';
import { CLIENT_REGISTRY } from './clientRegistry';

// ── Workspace / build ops data ─────────────────────────────────────────────────

type OUnit = { status: string; claimedBy?: string; id: string };
const _units = (orchestration as { units: OUnit[] }).units;
const _done = _units.filter((u) => u.status === 'done').length;
const _queued = _units.filter((u) => u.status === 'approved').length;
const _inFlight = _units.filter((u) => u.status === 'claimed');

const API_ACCOUNTS = [
  {
    label: 'Anthropic',
    sub: 'console.anthropic.com',
    href: 'https://console.anthropic.com/settings/usage',
  },
  { label: 'OpenRouter', sub: 'openrouter.ai', href: 'https://openrouter.ai/settings/billing' },
] as const;

// ── Client card type + derivation ─────────────────────────────────────────────

type ClientCard = {
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
};

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

const ALL_CARDS = Object.entries(CLIENT_REGISTRY).map(([s, f]) => deriveCard(s, f));
const CLIENTS = ALL_CARDS.filter((c) => c.status === 'active');
const PROSPECTS = ALL_CARDS.filter((c) => c.status === 'prospect');

// ── Service offerings ─────────────────────────────────────────────────────────

const SERVICES = [
  {
    id: 'website',
    label: 'Website',
    desc: 'Design, build, and launch — WordPress, Webflow, or custom',
    tier: 'starter',
  },
  {
    id: 'automation',
    label: 'Automation Sprint',
    desc: 'Lead intake, inbox triage, follow-up sequences, Zapier/Make',
    tier: 'core',
  },
  {
    id: 'design-sys',
    label: 'Design System',
    desc: 'Token-based HDS — components, docs, Figma handoff',
    tier: 'premium',
  },
  {
    id: 'ai-layer',
    label: 'AI Layer',
    desc: 'Local/contained AI — email triage bot, call transcription, form pre-fill',
    tier: 'premium',
  },
  {
    id: 'bot',
    label: 'Ops Bot (Discord/Web)',
    desc: 'Custom command center — status, tasks, notifications',
    tier: 'premium',
  },
  {
    id: 'analytics',
    label: 'Reporting Dashboard',
    desc: 'Auto-pull data, status cards, lead pipeline visibility',
    tier: 'core',
  },
  {
    id: 'branding',
    label: 'Brand Audit',
    desc: 'Touchpoint scrub, quick-win deck, identity consistency review',
    tier: 'starter',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        ...hds.typeStyles.eyebrow,
        margin: 0,
        color: 'var(--semantic-color-content-secondary)',
      }}
    >
      {children}
    </p>
  );
}

function ApiCard({ label, sub, href }: { label: string; sub: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
      <Surface
        padding="item"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: hds.space.px16,
          height: '100%',
        }}
      >
        <div>
          <p
            style={{
              ...hds.typeStyles.ui,
              margin: 0,
              color: 'var(--semantic-color-content-primary)',
            }}
          >
            {label}
          </p>
          <p
            style={{
              ...hds.typeStyles.ui,
              margin: 0,
              color: 'var(--semantic-color-content-secondary)',
            }}
          >
            {sub}
          </p>
        </div>
        <ExternalLink size={14} color="var(--semantic-color-content-secondary)" />
      </Surface>
    </a>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OpsDashboardPage() {
  const pct = Math.round((_done / _units.length) * 100);
  const STATS = [
    { v: String(_done), l: 'Done' },
    { v: String(_queued), l: 'Queued' },
    { v: String(_inFlight.length), l: 'In-flight' },
    { v: String(_units.length), l: 'Total' },
    { v: `${pct}%`, l: 'Complete' },
  ];

  return (
    <Page>
      <Stack direction="column" gap="spacious">
        {/* Header */}
        <PageHeader title="Ops" lede="Hirobius agency workspace — clients, pipeline, offerings" />

        {/* Workspace HQ */}
        <section>
          <h2 style={s.sectionTitle}>Workspace</h2>
          <Stack direction="column" gap="gap">
            <BandLabel>API Accounts</BandLabel>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: hds.semantic.space.component.gap,
              }}
            >
              {API_ACCOUNTS.map((a) => (
                <ApiCard key={a.label} {...a} />
              ))}
            </div>
            <BandLabel>Build Pipeline</BandLabel>
            <div
              style={{
                display: 'flex',
                gap: 'var(--semantic-space-layout-normal)',
                flexWrap: 'wrap',
              }}
            >
              {STATS.map((st) => (
                <div key={st.l}>
                  <p
                    style={{
                      ...hds.typeStyles.h2,
                      margin: 0,
                      color: 'var(--semantic-color-content-primary)',
                    }}
                  >
                    {st.v}
                  </p>
                  <p
                    style={{
                      ...hds.typeStyles.ui,
                      margin: 0,
                      color: 'var(--semantic-color-content-secondary)',
                    }}
                  >
                    {st.l}
                  </p>
                </div>
              ))}
            </div>
            {_inFlight.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: hds.semantic.space.component.gap,
                }}
              >
                {_inFlight.map((u) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      gap: hds.semantic.space.component.gap,
                      alignItems: 'baseline',
                    }}
                  >
                    <code
                      style={{
                        ...hds.typeStyles.mono,
                        margin: 0,
                        color: 'var(--semantic-color-content-primary)',
                      }}
                    >
                      {u.id}
                    </code>
                    <span
                      style={{
                        ...hds.typeStyles.ui,
                        margin: 0,
                        color: 'var(--semantic-color-content-secondary)',
                      }}
                    >
                      {u.claimedBy ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Stack>
        </section>

        {/* Security Posture */}
        <section>
          <h2 style={s.sectionTitle}>Security</h2>
          <SecurityPostureWidget />
        </section>

        {/* Sessions — preview only; full surface (input + filters) lives at /ops/sessions */}
        <section>
          <div style={s.sectionHead}>
            <h2 style={s.sectionTitle}>Sessions</h2>
            <a href="/ops/sessions" style={s.addLink}>
              View all →
            </a>
          </div>
          <SessionsSection registry={CLIENT_REGISTRY} compact />
        </section>

        {/* Clients */}
        <section>
          <div style={s.sectionHead}>
            <h2 style={s.sectionTitle}>Clients</h2>
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

        {/* Service menu */}
        <section>
          <h2 style={s.sectionTitle}>Service Menu</h2>
          <p style={s.sectionNote}>
            Modular offerings — mix-match for each client. Packages = curated bundles of these.
          </p>
          <div style={s.serviceGrid}>
            {SERVICES.map((svc) => (
              <Card key={svc.id} padding="none">
                <Card.Header
                  metadata={
                    <Badge
                      tone={
                        svc.tier === 'starter'
                          ? 'success'
                          : svc.tier === 'core'
                            ? 'info'
                            : 'warning'
                      }
                    >
                      {svc.tier}
                    </Badge>
                  }
                >
                  <Card.Title>{svc.label}</Card.Title>
                  <Card.Description>{svc.desc}</Card.Description>
                </Card.Header>
              </Card>
            ))}
          </div>
        </section>

        {/* Package templates */}
        <section>
          <h2 style={s.sectionTitle}>Package Templates</h2>
          <div style={s.pkgGrid}>
            <PackageCard
              name="Starter"
              price="$500–$1,500"
              tagline="Get online and look professional"
              includes={[
                'Website (5 pages)',
                'Brand audit + quick-win deck',
                'Google Business Profile cleanup',
              ]}
              bestFor="New businesses, solopreneurs, referrals wanting a clean web presence"
            />
            <PackageCard
              name="Growth"
              price="$1,500–$3,500"
              tagline="Stop doing it by hand"
              includes={[
                'Everything in Starter',
                'Automation sprint (lead intake, inbox triage, follow-ups)',
                'Reporting dashboard',
              ]}
              bestFor="Owner-operated businesses hitting a capacity wall"
              highlight
            />
            <PackageCard
              name="Command Center"
              price="$3,500–$7,500+"
              tagline="Run it like a machine"
              includes={[
                'Everything in Growth',
                'AI layer (local — email triage, call transcription)',
                'Custom ops bot (Discord or web)',
                'Design system if needed',
              ]}
              bestFor="Clients ready to scale or who want near-autonomous operation"
            />
          </div>
        </section>
      </Stack>
    </Page>
  );
}

// ── Client row ─────────────────────────────────────────────────────────────────

function ClientRow({ client: c }: { client: ClientCard }) {
  const isProspect = c.status === 'prospect';
  return (
    <Card
      as="a"
      // anchor-specific props pass through; href stays semantic
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
  // Interactive add-card affordance: the dashed border IS the call-to-action
  // signal (ghosted slot to fill). The only legitimate outlined surface in
  // this file — interactive, signal-bearing, not a repeated container.
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

function PackageCard({
  name,
  price,
  tagline,
  includes,
  bestFor,
  highlight,
}: {
  name: string;
  price: string;
  tagline: string;
  includes: string[];
  bestFor: string;
  highlight?: boolean;
}) {
  return (
    <Card padding="none" tone={highlight ? 'accent' : 'default'}>
      <Card.Header>
        <Card.Title>{name}</Card.Title>
        <p style={s.pkgPrice}>{price}</p>
        <Card.Description>{tagline}</Card.Description>
      </Card.Header>
      <Card.Body>
        <ul style={s.pkgList}>
          {includes.map((item, i) => (
            <li key={i} style={s.pkgItem}>
              {item}
            </li>
          ))}
        </ul>
      </Card.Body>
      <Card.Footer>
        <p style={s.pkgBestFor}>
          <strong>Best for:</strong> {bestFor}
        </p>
      </Card.Footer>
    </Card>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Refactor 2026-05-03 (12d-card-anatomy + outline-removal): card archetypes
// migrated to Card slots; dead style keys removed. Only typography,
// section, grid, and inline-content styles remain.

const s = {
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: hds.semantic.space.component.gap,
    flexWrap: 'wrap',
    gap: hds.semantic.space.component.gap,
  },
  sectionTitle: {
    ...hds.typeStyles.h2,
    margin: `0 0 ${hds.semantic.space.component.gap}`,
    color: 'var(--semantic-color-content-primary)',
  },
  sectionNote: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    margin: `0 0 ${hds.semantic.space.component.gap}`,
    maxWidth: '60ch',
  },
  addLink: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
  },

  // Responsive grids — collapse to 1 col under 480px, expand as space allows.
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
  serviceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
    gap: hds.semantic.space.component.gap,
  },
  pkgGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))',
    gap: 'var(--semantic-space-layout-normal)',
  },

  // NewClientSlot inner text (the dashed-border affordance is inlined).
  newSlotLabel: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    margin: '0 0 4px',
  },
  newSlotSub: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', margin: 0 },
  newClientSlot: {
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '140px',
    padding: hds.semantic.space.section.inset,
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
  },

  // PackageCard internal content (Card handles the box).
  pkgPrice: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    margin: '0 0 8px',
  },
  pkgList: {
    paddingLeft: hds.semantic.space.component.gap,
    margin: `0 0 ${hds.semantic.space.component.gap}`,
  },
  pkgItem: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-primary)',
    marginBottom: '6px',
  },
  pkgBestFor: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', margin: 0 },
} satisfies Record<string, CSSProperties>;
