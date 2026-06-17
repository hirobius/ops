/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */
/* eslint-disable tailwindcss/no-custom-classname -- report-section is a print CSS hook, not a Tailwind class */

/**
 * ClientReportPage — /ops/clients/:slug/report
 *
 * Weekly status digest for the client (Conrad, etc.). Same data source as
 * ClientDashboardPage but translated into plain language: no operator jargon,
 * no env keys, no dispatch state, no "scaffolded" badge soup. The URL is
 * stable and bookmark-able so the weekly status email points at it.
 *
 * Print-friendly via @media print: drops nav chrome and forces page-breaks
 * between major sections so the operator can save-as-PDF if a client prefers
 * that to a link.
 */

import React from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router';
import { Page } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import { Callout } from '@hirobius/design-system';
import { EmptyState } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from './PageHeader';

import type {
  ClientFiles,
  ClientMeta,
  ClientTasksFile,
  ClientChecklistFile,
  ClientRetainerFile,
  ClientGoalsFile,
  ClientAutomationConfig,
  ClientWorkflowConfig,
  ClientWorkflow,
} from './clientTypes';

// ── Manifest-driven registry (same shape as ClientDashboardPage) ──────────────
// Duplicated rather than refactored shared because the Vite glob has to live
// in the consuming module to be statically resolved at build time.

const _metas = import.meta.glob<{ default: ClientMeta }>('../../../../clients/*/meta.json', {
  eager: true,
});
const _tasks = import.meta.glob<{ default: ClientTasksFile }>('../../../../clients/*/tasks.json', {
  eager: true,
});
const _checks = import.meta.glob<{ default: ClientChecklistFile }>(
  '../../../../clients/*/checklist.json',
  { eager: true },
);
const _retains = import.meta.glob<{ default: ClientRetainerFile }>(
  '../../../../clients/*/retainer.json',
  { eager: true },
);
const _goals = import.meta.glob<{ default: ClientGoalsFile }>('../../../../clients/*/goals.json', {
  eager: true,
});
const _autoCfgs = import.meta.glob<{ default: ClientAutomationConfig }>(
  '../../../../clients/*/automation-config.json',
  { eager: true },
);
const _workflows = import.meta.glob<{ default: ClientWorkflowConfig }>(
  '../../../../clients/*/automations/*/config.json',
  { eager: true },
);

function slugOf(p: string) {
  return p.match(/clients\/([^/]+)\//)?.[1] ?? '';
}
function workflowOf(p: string) {
  const m = p.match(/clients\/([^/]+)\/automations\/([^/]+)\/config\.json/);
  return m ? { slug: m[1], workflowId: m[2] } : null;
}
function shouldRegister(slug: string) {
  return Boolean(slug) && !slug.startsWith('_');
}

const REGISTRY: Record<string, ClientFiles> = {};
for (const [p, m] of Object.entries(_metas)) {
  const s = slugOf(p);
  if (shouldRegister(s)) REGISTRY[s] = { meta: m.default };
}
for (const [p, m] of Object.entries(_tasks)) {
  const s = slugOf(p);
  if (shouldRegister(s) && REGISTRY[s]) REGISTRY[s].tasks = m.default;
}
for (const [p, m] of Object.entries(_checks)) {
  const s = slugOf(p);
  if (shouldRegister(s) && REGISTRY[s]) REGISTRY[s].checklist = m.default;
}
for (const [p, m] of Object.entries(_retains)) {
  const s = slugOf(p);
  if (shouldRegister(s) && REGISTRY[s]) REGISTRY[s].retainer = m.default;
}
for (const [p, m] of Object.entries(_goals)) {
  const s = slugOf(p);
  if (shouldRegister(s) && REGISTRY[s]) REGISTRY[s].goals = m.default;
}
for (const [p, m] of Object.entries(_autoCfgs)) {
  const s = slugOf(p);
  if (shouldRegister(s) && REGISTRY[s]) REGISTRY[s].automationConfig = m.default;
}
for (const [p, m] of Object.entries(_workflows)) {
  const r = workflowOf(p);
  if (!r || !shouldRegister(r.slug) || !REGISTRY[r.slug]) continue;
  REGISTRY[r.slug].workflows = [
    ...(REGISTRY[r.slug].workflows ?? []),
    { id: r.workflowId, config: m.default },
  ];
}
for (const slug of Object.keys(REGISTRY)) {
  if (REGISTRY[slug].workflows) REGISTRY[slug].workflows!.sort((a, b) => a.id.localeCompare(b.id));
}

// ── Plain-language translation ────────────────────────────────────────────────
// Keys are operator-side status strings; values are what the client reads.

const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  complete: 'Done',
  'in-progress': 'In progress',
  blocked: 'Waiting on you',
  'not-started': 'Not started',
  todo: 'Not started',
  planned: 'Planned',
  evaluating: 'Evaluating',
  scaffolded: 'Built, awaiting access',
  'pending-access': 'Awaiting access',
  'pending-activation': 'Awaiting activation',
  deferred: 'Deferred',
  unknown: 'Unknown',
  'phase-2-candidate': 'Planned for Phase 2',
};

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';
const STATUS_TONE: Record<string, Tone> = {
  done: 'success',
  complete: 'success',
  'in-progress': 'warning',
  blocked: 'danger',
  'not-started': 'neutral',
  todo: 'neutral',
  planned: 'info',
  evaluating: 'info',
  scaffolded: 'info',
  'pending-access': 'warning',
  'pending-activation': 'warning',
  deferred: 'neutral',
  unknown: 'neutral',
  'phase-2-candidate': 'info',
};

function label(status: string | undefined): string {
  return STATUS_LABEL[status ?? ''] ?? status ?? '—';
}
function tone(status: string | undefined): Tone {
  return STATUS_TONE[status ?? ''] ?? 'neutral';
}

// Workflow promotion state — one of three Conrad-readable strings.
type WorkflowState = { label: string; tone: Tone };
function workflowState(mode: string | undefined): WorkflowState {
  if (mode === 'production') return { label: 'Live', tone: 'success' };
  if (mode === 'test') return { label: 'Ready for live test', tone: 'warning' };
  return { label: 'Setup pending', tone: 'neutral' };
}

// Workflow descriptions — one-line plain English. Falls back to the id if
// we don't have a translation (so a new automation appears with no doc work).
const WORKFLOW_BLURB: Record<string, string> = {
  'lead-intake': 'New leads from your website land directly in EZLynx.',
  'email-triage': 'Incoming email is sorted into work-queue categories.',
  'auto-responder': 'New leads get an acknowledgment email within minutes.',
  'renewal-reminder': 'Customers receive reminders before their policy renews.',
  'cancellation-winback': 'Cancelled customers get a 3-touch win-back follow-up.',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const data = REGISTRY[slug ?? ''];

  if (!data) {
    return (
      <Page maxWidth="content">
        <EmptyState title={`No report found for ${slug ?? ''}`} />
      </Page>
    );
  }

  const weekEnding = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activePhase = pickActivePhase(data.tasks);
  const blockers = pickClientBlockers(data);
  const inFlight = pickInFlight(activePhase);

  return (
    <Page>
      <style>{PRINT_CSS}</style>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[
            { label: 'Ops', href: '/ops' },
            { label: 'Clients', href: '/ops/clients' },
            { label: data.meta.name, href: `/ops/clients/${slug}` },
            { label: 'Report' },
          ]}
          title={data.meta.name}
        />
        <Header meta={data.meta} weekEnding={weekEnding} />

        <SectionHeadline
          activePhase={activePhase}
          workflows={data.workflows}
          config={data.automationConfig}
        />

        {(data.tasks?.phases ?? []).length > 0 && (
          <section className="report-section">
            <h2 style={s.sectionTitle}>Where we are</h2>
            <PhaseProgress tasks={data.tasks} />
          </section>
        )}

        {(data.workflows?.length ?? 0) > 0 && (
          <section className="report-section">
            <h2 style={s.sectionTitle}>What&apos;s automated</h2>
            <WorkflowList workflows={data.workflows ?? []} mode={data.automationConfig?.mode} />
          </section>
        )}

        {blockers.length > 0 && (
          <section className="report-section">
            <h2 style={s.sectionTitle}>Asks of you</h2>
            <BlockerList items={blockers} />
          </section>
        )}

        {inFlight.length > 0 && (
          <section className="report-section">
            <h2 style={s.sectionTitle}>What&apos;s next</h2>
            <InFlightList items={inFlight} />
          </section>
        )}

        <Footer meta={data.meta} />
      </Stack>
    </Page>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header({ meta, weekEnding }: { meta: ClientMeta; weekEnding: string }) {
  return (
    <header style={s.header}>
      <p style={s.eyebrow}>Status Report — week ending {weekEnding}</p>
      <h1 style={s.pageTitle}>{meta.name}</h1>
      <p style={s.ui}>Prepared by Hirobius for {meta.contact?.name ?? meta.name}.</p>
    </header>
  );
}

// One-sentence headline derived from data, so the report feels like a status
// summary not a data dump. Defensive against missing data.
function SectionHeadline({
  activePhase,
  workflows,
  config,
}: {
  activePhase?: ClientPhaseLite;
  workflows?: ClientWorkflow[];
  config?: ClientAutomationConfig;
}) {
  const phaseName = activePhase?.name ?? 'Setup';
  const total = activePhase?.totalTasks ?? 0;
  const done = activePhase?.doneTasks ?? 0;
  const live =
    (workflows ?? []).length > 0 && config?.mode === 'production'
      ? `${workflows!.length} workflow${workflows!.length === 1 ? '' : 's'} live`
      : (workflows?.length ?? 0) > 0
        ? `${workflows!.length} workflow${workflows!.length === 1 ? '' : 's'} ready for live test`
        : null;
  const fragments: string[] = [];
  if (total > 0) fragments.push(`${done} of ${total} ${phaseName} deliverables done`);
  if (live) fragments.push(live);
  return (
    <Callout tone="accent">
      <p style={{ ...s.body, margin: 0 }}>
        {fragments.length > 0 ? fragments.join(' · ') : `${phaseName} in progress.`}
      </p>
    </Callout>
  );
}

// ── Phase progress ────────────────────────────────────────────────────────────

interface ClientPhaseLite {
  id: string;
  name: string;
  status: string;
  doneTasks: number;
  totalTasks: number;
}

function summarizePhase(phase: NonNullable<ClientTasksFile['phases']>[number]): ClientPhaseLite {
  const all = (phase.swimlanes ?? []).flatMap((b) => b.tasks ?? []).concat(phase.tasks ?? []);
  const done = all.filter((t) => t.status === 'done' || t.status === 'complete').length;
  return {
    id: phase.id,
    name: phase.name,
    status: phase.status,
    doneTasks: done,
    totalTasks: all.length,
  };
}

function pickActivePhase(tasks?: ClientTasksFile): ClientPhaseLite | undefined {
  const phases = (tasks?.phases ?? []).map(summarizePhase);
  return (
    phases.find((p) => p.status === 'in-progress') ??
    phases.find((p) => p.totalTasks > 0 && p.doneTasks < p.totalTasks) ??
    phases[0]
  );
}

function PhaseProgress({ tasks }: { tasks?: ClientTasksFile }) {
  const phases = (tasks?.phases ?? []).map(summarizePhase);
  if (phases.length === 0) return <EmptyState title="No phases scoped yet" />;
  return (
    <Stack direction="column" gap="normal">
      {phases.map((p) => (
        <PhaseRow key={p.id} phase={p} />
      ))}
    </Stack>
  );
}

function PhaseRow({ phase }: { phase: ClientPhaseLite }) {
  const pct = phase.totalTasks > 0 ? Math.round((phase.doneTasks / phase.totalTasks) * 100) : 0;
  return (
    <div style={s.phaseRow}>
      <div style={s.phaseHead}>
        <span style={s.phaseName}>{phase.name}</span>
        <span style={s.phaseCount}>
          <Badge tone={tone(phase.status)}>{label(phase.status)}</Badge>
          <span style={s.phasePct}>
            {phase.doneTasks} of {phase.totalTasks}
          </span>
        </span>
      </div>
      <div style={s.barTrack} aria-hidden>
        <div style={{ ...s.barFill, width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Workflows ─────────────────────────────────────────────────────────────────

function WorkflowList({ workflows, mode }: { workflows: ClientWorkflow[]; mode?: string }) {
  return (
    <Stack direction="column" gap="inset">
      {workflows.map((wf) => {
        const state = workflowState(mode);
        const blurb = WORKFLOW_BLURB[wf.id] ?? wf.id;
        return (
          <div key={wf.id} style={s.workflowRow}>
            <div style={s.workflowText}>
              <p style={s.workflowName}>{wf.id}</p>
              <p style={s.ui}>{blurb}</p>
            </div>
            <Badge tone={state.tone}>{state.label}</Badge>
          </div>
        );
      })}
    </Stack>
  );
}

// ── Blockers (asks of the client) ─────────────────────────────────────────────

interface ClientBlocker {
  id: string;
  text: string;
  notes?: string;
  source: string; // "checklist" or "retainer" or "phase X"
}

function pickClientBlockers(data: ClientFiles): ClientBlocker[] {
  const out: ClientBlocker[] = [];
  const clientName = (data.meta.contact?.name ?? '').toLowerCase();

  // Retainer-level blockers — these are explicit and Conrad-facing.
  for (const b of data.retainer?.blockers ?? []) {
    out.push({ id: `retainer-${out.length}`, text: b, source: 'retainer' });
  }

  // Checklist items in non-done state where owner is the client OR the notes
  // mention the client by name. If `owner` is missing on a non-done item,
  // include it too — the client is the default party we're prompting for things.
  for (const cat of data.checklist?.categories ?? []) {
    for (const item of cat.items ?? []) {
      if (item.status === 'done' || item.status === 'complete') continue;
      const owner = (item.owner ?? '').toLowerCase();
      const notes = (item.notes ?? '').toLowerCase();
      const referencesClient =
        clientName.length > 0 && (owner.includes(clientName) || notes.includes(clientName));
      const ownedByClient = owner.length > 0 && owner !== 'adrian' && owner !== 'hirobius';
      if (referencesClient || ownedByClient) {
        out.push({
          id: item.id,
          text: item.item,
          notes: item.notes,
          source: cat.name,
        });
      }
    }
  }

  return out;
}

function BlockerList({ items }: { items: ClientBlocker[] }) {
  return (
    <ol style={s.blockerList}>
      {items.map((b) => (
        <li key={b.id} style={s.blockerItem}>
          <p style={s.body}>{b.text}</p>
          {b.notes && <p style={s.uiSecondary}>{b.notes}</p>}
        </li>
      ))}
    </ol>
  );
}

// ── In-flight tasks ───────────────────────────────────────────────────────────

interface InFlightItem {
  id: string;
  title: string;
  notes?: string;
}

function pickInFlight(phase?: ClientPhaseLite): InFlightItem[] {
  // Pull task list out of REGISTRY again for the active phase id.
  if (!phase) return [];
  const slug = Object.keys(REGISTRY).find((s) =>
    (REGISTRY[s].tasks?.phases ?? []).some((p) => p.id === phase.id),
  );
  if (!slug) return [];
  const p = (REGISTRY[slug].tasks?.phases ?? []).find((p) => p.id === phase.id);
  if (!p) return [];
  const all = (p.swimlanes ?? []).flatMap((b) => b.tasks ?? []).concat(p.tasks ?? []);
  return all
    .filter((t) => t.status === 'in-progress')
    .slice(0, 5)
    .map((t) => ({ id: t.id, title: t.title, notes: t.notes }));
}

function InFlightList({ items }: { items: InFlightItem[] }) {
  return (
    <Stack direction="column" gap="inset">
      {items.map((t) => (
        <div key={t.id} style={s.nextRow}>
          <p style={s.body}>{t.title}</p>
          {t.notes && <p style={s.uiSecondary}>{t.notes}</p>}
        </div>
      ))}
    </Stack>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer({ meta }: { meta: ClientMeta }) {
  return (
    <footer style={s.footer}>
      <p style={s.uiSecondary}>
        Questions? Reply to the email this came in or reach Adrian at adrian@hirobius.com.
      </p>
      <p style={s.uiSecondary}>
        Hirobius · Status report for {meta.name} · Generated {new Date().toISOString().slice(0, 10)}
        .
      </p>
    </footer>
  );
}

// ── Print CSS ─────────────────────────────────────────────────────────────────

const PRINT_CSS = `
@media print {
  /* Drop ops chrome — header/nav/sidebar elements outside the page body. */
  nav, [role="navigation"], aside, .ops-shell-header { display: none !important; }
  body { background: white !important; color: black !important; }
  .report-section { break-inside: avoid; page-break-inside: avoid; }
  h1, h2, h3, h4 { color: black !important; break-after: avoid; }
  a { color: black !important; text-decoration: none !important; }
}
`;

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  header: {
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.space.px24,
  },
  eyebrow: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  },
  pageTitle: {
    ...hds.typeStyles.h1,
    margin: `${hds.space.px8} 0 ${hds.space.px8}`,
    color: 'var(--semantic-color-content-primary)',
  },
  sectionTitle: {
    ...hds.typeStyles.h2,
    margin: `0 0 ${hds.space.px16}`,
    color: 'var(--semantic-color-content-primary)',
  },

  body: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    margin: `0 0 ${hds.space.px2}`,
  },
  ui: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', margin: 0 },
  uiSecondary: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  },

  // Phase row
  phaseRow: { display: 'grid', gap: hds.space.px8 },
  phaseHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: hds.space.px8,
  },
  phaseName: { ...hds.typeStyles.h3, color: 'var(--semantic-color-content-primary)', margin: 0 },
  phaseCount: { display: 'inline-flex', alignItems: 'center', gap: hds.space.px8 },
  phasePct: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)' },
  barTrack: {
    height: '6px',
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[2],
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    background: 'var(--semantic-color-content-accent)',
    transition: `width ${hds.duration.normal} ease`,
  },

  // Workflow row
  workflowRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: hds.space.px16,
    padding: `${hds.space.px8} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  workflowText: { display: 'flex', flexDirection: 'column', gap: hds.space.px2 },
  workflowName: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    margin: 0,
    fontWeight: 600, // eyebrow-ok: section title emphasis for client-facing report
  },

  // Blocker list
  blockerList: { paddingLeft: hds.space.px24, margin: 0 },
  blockerItem: { marginBottom: hds.space.px12 },

  // Next row
  nextRow: {
    paddingLeft: hds.space.px16,
    borderLeft: '2px solid var(--semantic-color-content-accent)',
  },

  // Footer
  footer: {
    borderTop: '1px solid var(--semantic-color-border-default)',
    paddingTop: hds.space.px24,
    display: 'flex',
    flexDirection: 'column',
    gap: hds.space.px6,
  },
} satisfies Record<string, CSSProperties>;
