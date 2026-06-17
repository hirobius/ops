/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import React from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router';
import { Page } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import { Callout } from '@hirobius/design-system';
import { StatusTile, type StatusTileTone } from '@hirobius/design-system';
import { TileGrid } from '@hirobius/design-system';
import { PhaseHeader, type PhaseHeaderTone } from '@hirobius/design-system';
import { EmptyState } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from './PageHeader';

// Domain-status → Badge tone. Owns the mapping; renderer is the canonical
// primitive so status badges always have consistent padding, type, and a11y
// regardless of which page they appear on (12d-card-anatomy slot rule).
type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';
const STATUS_TONE: Record<string, BadgeTone> = {
  done: 'success',
  complete: 'success',
  'in-progress': 'warning',
  blocked: 'danger',
  'not-started': 'neutral',
  planned: 'info',
  evaluating: 'info',
  todo: 'neutral',
  'agreed-verbal': 'info',
  prospect: 'info',
  'pro-bono': 'neutral',
  'phase-2-candidate': 'info',
  'pending-activation': 'warning',
  'pending-access': 'warning',
  unknown: 'neutral',
  deferred: 'neutral',
  'api-unknown': 'neutral',
  scaffolded: 'info',
};
function statusTone(status: string): BadgeTone {
  return STATUS_TONE[status] ?? 'neutral';
}
function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

// ── Manifest-driven client registry ───────────────────────────────────────────

import type {
  ClientFiles,
  ClientMeta,
  ClientTasksFile,
  ClientChecklistFile,
  ClientRetainerFile,
  ClientGoalsFile,
  ClientTask,
  ClientAutomationConfig,
  ClientWorkflowConfig,
  ClientWorkflow,
} from './clientTypes';

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

const CLIENT_REGISTRY: Record<string, ClientFiles> = {};
// Skip slugs starting with `_` (e.g. `_template/`) — those are scaffolding,
// not real clients, and shouldn't appear in the dashboard.
function shouldRegister(slug: string) {
  return Boolean(slug) && !slug.startsWith('_');
}

for (const [p, m] of Object.entries(_metas)) {
  const s = slugOf(p);
  if (shouldRegister(s)) CLIENT_REGISTRY[s] = { meta: m.default };
}
for (const [p, m] of Object.entries(_tasks)) {
  const s = slugOf(p);
  if (shouldRegister(s) && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].tasks = m.default;
}
for (const [p, m] of Object.entries(_checks)) {
  const s = slugOf(p);
  if (shouldRegister(s) && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].checklist = m.default;
}
for (const [p, m] of Object.entries(_retains)) {
  const s = slugOf(p);
  if (shouldRegister(s) && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].retainer = m.default;
}
for (const [p, m] of Object.entries(_goals)) {
  const s = slugOf(p);
  if (shouldRegister(s) && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].goals = m.default;
}
for (const [p, m] of Object.entries(_autoCfgs)) {
  const s = slugOf(p);
  if (shouldRegister(s) && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].automationConfig = m.default;
}
for (const [p, m] of Object.entries(_workflows)) {
  const r = workflowOf(p);
  if (!r || !shouldRegister(r.slug) || !CLIENT_REGISTRY[r.slug]) continue;
  const wf = { id: r.workflowId, config: m.default };
  CLIENT_REGISTRY[r.slug].workflows = [...(CLIENT_REGISTRY[r.slug].workflows ?? []), wf];
}
// Sort workflows by id for stable rendering
for (const slug of Object.keys(CLIENT_REGISTRY)) {
  if (CLIENT_REGISTRY[slug].workflows) {
    CLIENT_REGISTRY[slug].workflows!.sort((a, b) => a.id.localeCompare(b.id));
  }
}

// ── Status colours ─────────────────────────────────────────────────────────────

const STATUS_TONE_MAP: Record<string, StatusTileTone> = {
  done: 'success',
  complete: 'success',
  'in-progress': 'warning',
  blocked: 'danger',
  'not-started': 'neutral',
  planned: 'info',
  evaluating: 'info',
  todo: 'neutral',
  'phase-2-candidate': 'info',
  'pending-activation': 'warning',
  'pending-access': 'warning',
  scaffolded: 'info',
  unknown: 'neutral',
  deferred: 'neutral',
};
function tileTone(status: string): StatusTileTone {
  return STATUS_TONE_MAP[status] ?? 'neutral';
}
const STATUS_LABEL: Record<string, string> = {
  done: 'Done',
  complete: 'Done',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  'not-started': 'Not Started',
  planned: 'Planned',
  todo: 'To Do',
  evaluating: 'Evaluating',
  'agreed-verbal': 'Verbal Agreed',
  prospect: 'Prospect',
  'pro-bono': 'Pro Bono',
  'phase-2-candidate': 'Phase 2 Candidate',
  'pending-activation': 'Pending Activation',
  'pending-access': 'Pending Access',
  scaffolded: 'Scaffolded',
  deferred: 'Deferred',
  unknown: 'Unknown',
  'api-unknown': 'API Unknown',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const data = CLIENT_REGISTRY[slug ?? ''];

  if (!data) {
    return (
      <Page maxWidth="content">
        <div style={{ textAlign: 'center' }}>
          <p style={s.ui}>
            No client workspace found for <code>{slug}</code>
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <Header data={data} slug={slug ?? ''} />
        {data.meta.status === 'prospect' ? (
          <ProspectBody data={data} />
        ) : (
          <ActiveBody data={data} />
        )}
      </Stack>
    </Page>
  );
}

// ── Shared header ─────────────────────────────────────────────────────────────

function Header({ data, slug }: { data: ClientFiles; slug: string }) {
  const { meta } = data;
  const isProspect = meta.status === 'prospect';
  return (
    <div style={s.header}>
      <PageHeader
        breadcrumbs={[
          { label: 'Ops', href: '/ops' },
          { label: 'Clients', href: '/ops/clients' },
          ...(isProspect ? [{ label: 'Prospects' }] : []),
          { label: meta.name },
        ]}
        title={meta.name}
      />
      <div style={s.metaRow}>
        {meta.location && <Pill label={meta.location} />}
        {meta.type && <Pill label={meta.type} />}
        {meta.scale?.customers != null && <Pill label={`${meta.scale.customers} customers`} />}
        {meta.scale?.policies != null && <Pill label={`${meta.scale.policies} policies`} />}
        <Pill label={meta.status} accent />
      </div>
      {meta.referredBy && (
        <p style={{ ...s.ui, marginTop: hds.space.px6 }}>Referred by {meta.referredBy}</p>
      )}
      {slug && <p style={{ ...s.ui, marginTop: hds.space.px2, opacity: 0.5 }}>{slug}</p>}
    </div>
  );
}

// ── Active client body ────────────────────────────────────────────────────────

function ActiveBody({ data }: { data: ClientFiles }) {
  const { tasks, checklist, retainer, goals, automationConfig, workflows } = data;
  return (
    <>
      <RetainerCard retainer={retainer} />
      <section>
        <h2 style={s.sectionTitle}>Phases</h2>
        <PhaseSurfaces tasks={tasks} />
      </section>
      {(automationConfig || workflows) && (
        <section>
          <h2 style={s.sectionTitle}>Automations</h2>
          <AutomationsPanel config={automationConfig} workflows={workflows} />
        </section>
      )}
      <div style={s.midGrid}>
        <section>
          <h2 style={s.sectionTitle}>Checklist</h2>
          <ChecklistPanel checklist={checklist} />
        </section>
        <section>
          <h2 style={s.sectionTitle}>Goals</h2>
          <GoalsPanel goals={goals} />
        </section>
      </div>
    </>
  );
}

// ── Prospect body ─────────────────────────────────────────────────────────────

function ProspectBody({ data }: { data: ClientFiles }) {
  const { tasks, checklist, retainer, goals } = data;
  return (
    <>
      <PackageHypothesisCard retainer={retainer} />

      {/* Notes banner */}
      {retainer?.hypothesisRationale && (
        <Callout tone="accent" italic>
          <p style={{ ...s.ui, margin: 0 }}>&ldquo;{retainer.hypothesisRationale}&rdquo;</p>
        </Callout>
      )}

      <section>
        <h2 style={s.sectionTitle}>Pre-Consult Phases</h2>
        <PhaseSurfaces tasks={tasks} />
      </section>

      <div style={s.midGrid}>
        <section>
          <h2 style={s.sectionTitle}>Prep Checklist</h2>
          <ChecklistPanel checklist={checklist} />
        </section>
        <section>
          <h2 style={s.sectionTitle}>Goals</h2>
          <GoalsPanel goals={goals} />
        </section>
      </div>
    </>
  );
}

// ── Retainer card ─────────────────────────────────────────────────────────────

function RetainerCard({ retainer }: { retainer?: ClientRetainerFile }) {
  if (!retainer) {
    return (
      <section>
        <p style={s.cardLabel}>Retainer</p>
        <p style={s.metricValue}>—</p>
        <p style={s.ui}>No retainer data</p>
      </section>
    );
  }
  const p = retainer.currentPhase;
  return (
    <section>
      <Stack direction="column" gap="normal">
        <div>
          <p style={s.cardLabel}>Retainer</p>
          <p style={s.metricValue}>${(p.scopedAt ?? 0).toLocaleString()}</p>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: hds.semantic.space.subgrid.xs,
            }}
          >
            <span style={s.ui}>{p.phase}</span>
            <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
          </span>
        </div>
        {retainer.blockers?.length > 0 && (
          <Callout tone="danger">
            {(retainer.blockers as string[]).map((b, i) => (
              <p key={i} style={s.blockerItem}>
                {b}
              </p>
            ))}
          </Callout>
        )}
        {(retainer.futureTiers ?? []).length > 0 && (
          <div>
            <h3 style={s.subsectionTitle}>Future tiers</h3>
            {(retainer.futureTiers ?? []).map((t, i: number) => (
              <p key={i} style={{ ...s.ui, margin: `${hds.space.px2} 0` }}>
                {t.tier}
              </p>
            ))}
          </div>
        )}
      </Stack>
    </section>
  );
}

// ── Package hypothesis (prospects only) ───────────────────────────────────────

function PackageHypothesisCard({ retainer }: { retainer?: ClientRetainerFile }) {
  if (!retainer) {
    return (
      <section>
        <p style={s.cardLabel}>Package Hypothesis</p>
        <p style={s.metricValue}>—</p>
        <p style={s.ui}>No data</p>
      </section>
    );
  }
  const tier = retainer.futureTiers?.[0];
  return (
    <section>
      <Stack direction="column" gap="normal">
        <div>
          <p style={s.cardLabel}>Package Hypothesis</p>
          <p style={{ ...s.metricValue, color: 'var(--semantic-color-content-accent)' }}>
            {retainer.packageHypothesis ?? '—'}
          </p>
          <p style={s.ui}>{retainer.estimatedScope ?? '—'}</p>
        </div>
        {retainer.blockers?.length > 0 && (
          <Callout tone="danger">
            {(retainer.blockers as string[]).map((b, i) => (
              <p key={i} style={s.blockerItem}>
                {b}
              </p>
            ))}
          </Callout>
        )}
        {tier && (
          <div>
            <h3 style={s.subsectionTitle}>Scope</h3>
            {(tier.includes as string[] | undefined)?.map((item, i) => (
              <p key={i} style={{ ...s.ui, margin: `${hds.space.px2} 0` }}>
                · {item}
              </p>
            ))}
          </div>
        )}
      </Stack>
    </section>
  );
}

// ── Phase sections ────────────────────────────────────────────────────────────
// Each phase is an open section: a phase header (h3) at the top, lane groups
// (h4) below, and tasks rendered as StatusTiles inside auto-fill grids. No
// surface wrapper — phases are rhythm-separated by stack whitespace, not
// nested chrome.

function PhaseSurfaces({ tasks }: { tasks?: ClientTasksFile }) {
  if (!tasks) return null;
  return (
    <Stack direction="column" gap="spacious">
      {(tasks.phases ?? []).map((phase) => {
        const all = (phase.swimlanes ?? []).flatMap((b) => b.tasks ?? []);
        const done = all.filter((t) => t.status === 'done' || t.status === 'complete').length;
        const phaseTone: PhaseHeaderTone =
          phase.status === 'blocked'
            ? 'danger'
            : phase.status === 'done'
              ? 'success'
              : phase.status === 'in-progress'
                ? 'warning'
                : 'default';
        return (
          <section key={phase.id}>
            <Stack direction="column" gap="inset">
              <PhaseHeader
                as="h3"
                name={phase.name}
                budget={phase.budget}
                done={done}
                total={all.length}
                tone={phaseTone}
                trailing={
                  <Badge tone={statusTone(phase.status)}>{statusLabel(phase.status)}</Badge>
                }
              />
              {(phase.swimlanes ?? []).length === 0 ? (
                <EmptyState title="No tasks scoped yet" />
              ) : (
                (phase.swimlanes ?? []).map((lane) => (
                  <div key={lane.id}>
                    <h4 style={s.laneTitle}>{lane.name}</h4>
                    {lane.goal && (
                      <p style={{ ...s.ui, marginBottom: hds.space.px12 }}>{lane.goal}</p>
                    )}
                    <TileGrid minTileWidth="280px">
                      {(lane.tasks ?? []).map((task) => (
                        <TaskTile key={task.id} task={task} />
                      ))}
                    </TileGrid>
                  </div>
                ))
              )}
            </Stack>
          </section>
        );
      })}
    </Stack>
  );
}

function TaskTile({ task }: { task: ClientTask }) {
  const notes = [
    task.blockedReason && `Blocked: ${task.blockedReason}`,
    task.notes,
    task.owner && `Owner: ${task.owner}`,
    task.automationRef && `Wired: ${task.automationRef}`,
  ].filter(Boolean) as string[];
  return (
    <StatusTile
      tone={tileTone(task.status)}
      title={task.title}
      notes={notes}
      trailing={
        <span
          style={{
            display: 'inline-flex',
            gap: hds.space.px6,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {task.automationRef && <Badge tone="info">automation</Badge>}
          <Badge tone={statusTone(task.status)}>{statusLabel(task.status)}</Badge>
        </span>
      }
    />
  );
}

// ── Automations panel ─────────────────────────────────────────────────────────
// Reads automation-config.json (modes, LLM provider, system env-key readiness)
// and the per-workflow config.json files. No log-file reads — keeps the panel
// pure-static so it stays compatible with Vite's eager glob.

function AutomationsPanel({
  config,
  workflows,
}: {
  config?: ClientAutomationConfig;
  workflows?: ClientWorkflow[];
}) {
  if (!config && !workflows?.length) {
    return <EmptyState title="No automations scaffolded yet" />;
  }
  return (
    <Stack direction="column" gap="normal">
      <AutomationConfigStrip config={config} />
      {(workflows ?? []).length > 0 && (
        <div>
          <h3 style={s.groupTitle}>Workflows ({(workflows ?? []).length})</h3>
          <TileGrid minTileWidth="280px">
            {(workflows ?? []).map((wf) => (
              <WorkflowTile key={wf.id} wf={wf} />
            ))}
          </TileGrid>
        </div>
      )}
    </Stack>
  );
}

function AutomationConfigStrip({ config }: { config?: ClientAutomationConfig }) {
  if (!config) return null;
  const systems = Object.entries(config.systems ?? {});
  const provider = config.llm?.provider ?? 'none';
  const llmModel =
    provider === 'ollama'
      ? config.llm?.ollama?.model
      : provider === 'claude'
        ? config.llm?.claude?.model
        : undefined;
  return (
    <Stack direction="column" gap="inset">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px8 }}>
        {config.mode && (
          <Badge tone={config.mode === 'production' ? 'warning' : 'info'}>
            mode: {config.mode}
          </Badge>
        )}
        <Badge tone="neutral">
          LLM: {provider}
          {llmModel ? ` · ${llmModel}` : ''}
        </Badge>
        {config.outlook?.applyMode && (
          <Badge tone="neutral">outlook: {config.outlook.applyMode}</Badge>
        )}
        {config.testRecipient && <Badge tone="neutral">test → {config.testRecipient}</Badge>}
      </div>
      {systems.length > 0 && (
        <div>
          <h3 style={s.groupTitle}>Systems</h3>
          <TileGrid minTileWidth="220px">
            {systems.map(([id, sys]) => (
              <StatusTile
                key={id}
                tone={tileTone(sys.status ?? 'unknown')}
                title={id}
                notes={
                  [
                    sys.notes,
                    (sys.envKeys ?? []).length > 0 && `Env: ${(sys.envKeys ?? []).join(', ')}`,
                  ].filter(Boolean) as string[]
                }
                trailing={
                  <Badge tone={statusTone(sys.status ?? 'unknown')}>
                    {statusLabel(sys.status ?? 'unknown')}
                  </Badge>
                }
              />
            ))}
          </TileGrid>
        </div>
      )}
    </Stack>
  );
}

function WorkflowTile({ wf }: { wf: ClientWorkflow }) {
  const c = wf.config;
  const systems = (c.systemsTouched ?? []).join(', ');
  return (
    <StatusTile
      tone={tileTone('scaffolded')}
      title={wf.id}
      notes={
        [
          c.phase && `Phase: ${c.phase}`,
          systems && `Systems: ${systems}`,
          c.ownerSystem && `Owner: ${c.ownerSystem}`,
        ].filter(Boolean) as string[]
      }
      trailing={<Badge tone="info">scaffolded</Badge>}
    />
  );
}

// ── Checklist panel ───────────────────────────────────────────────────────────

function ChecklistPanel({ checklist }: { checklist?: ClientChecklistFile }) {
  if (!checklist) return null;
  return (
    <Stack direction="column" gap="normal">
      {(checklist.categories ?? []).map((cat) => (
        <div key={cat.id}>
          <h3 style={s.groupTitle}>{cat.name}</h3>
          <TileGrid minTileWidth="260px">
            {(cat.items ?? []).map((item) => (
              <StatusTile
                key={item.id}
                tone={tileTone(item.status)}
                title={item.item}
                notes={
                  [item.notes, item.owner && `Owner: ${item.owner}`].filter(Boolean) as string[]
                }
              />
            ))}
          </TileGrid>
        </div>
      ))}
    </Stack>
  );
}

// ── Goals panel ───────────────────────────────────────────────────────────────

function GoalsPanel({ goals }: { goals?: ClientGoalsFile }) {
  if (!goals) return null;
  const micro = goals.micro ?? [];
  const macro = goals.macro ?? [];
  return (
    <Stack direction="column" gap="normal">
      <div>
        <h3 style={s.groupTitle}>Micro Goals</h3>
        <TileGrid minTileWidth="260px">
          {micro.map((g) => (
            <StatusTile
              key={g.id}
              tone={tileTone(g.status)}
              title={g.goal}
              notes={g.metric ? [g.metric] : undefined}
            />
          ))}
        </TileGrid>
      </div>
      <div>
        <h3 style={s.groupTitle}>Macro Goals</h3>
        <TileGrid minTileWidth="260px">
          {macro.map((g) => (
            <StatusTile
              key={g.id}
              tone={tileTone(g.status)}
              title={g.goal}
              notes={
                [g.horizon && `Horizon: ${g.horizon}`, g.description].filter(Boolean) as string[]
              }
            />
          ))}
        </TileGrid>
      </div>
    </Stack>
  );
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

// 12d-card-anatomy: Pill is a thin wrapper over Badge so meta pills and
// status badges share the same primitive (consistent padding, type, a11y).
function Pill({ label, accent }: { label: string; accent?: boolean }) {
  return <Badge tone={accent ? 'info' : 'neutral'}>{label}</Badge>;
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Refactor 2026-05-03: same dead-var sweep as OpsDashboardPage.
// fg-primary → content-primary, brand-primary → content-accent,
// surface-default → surface-page, surface-secondary → surface-raised.
// Hardcoded fontSizes replaced with hds.typeStyles.* for canonical hierarchy.
// 1fr 1fr fixed grids replaced with auto-fit minmax for mobile collapse.

const s = {
  header: {
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.space.px24,
  },
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px6,
    marginBottom: hds.semantic.space.subgrid.xs,
    flexWrap: 'wrap',
  },
  crumb: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    textDecoration: 'none',
  },
  crumbSep: { ...hds.typeStyles.ui, color: 'var(--semantic-color-border-default)' },
  crumbActive: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-primary)' },
  pageTitle: { ...hds.typeStyles.h1, margin: 0, color: 'var(--semantic-color-content-primary)' },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: hds.space.px8, marginTop: hds.space.px16 },

  cardLabel: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    margin: `0 0 ${hds.space.px6}`,
  },
  metricValue: {
    ...hds.typeStyles.h2,
    color: 'var(--semantic-color-content-primary)',
    margin: `0 0 ${hds.space.px6}`,
  },
  blockerItem: { ...hds.typeStyles.ui, color: 'var(--semantic-color-feedback-error)', margin: 0 },

  sectionTitle: {
    ...hds.typeStyles.h2,
    margin: `0 0 ${hds.space.px16}`,
    color: 'var(--semantic-color-content-primary)',
  },
  subsectionTitle: {
    ...hds.typeStyles.h3,
    margin: `0 0 ${hds.space.px8}`,
    color: 'var(--semantic-color-content-primary)',
  },
  laneTitle: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    margin: `0 0 ${hds.space.px8}`,
  },

  midGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))',
    gap: hds.space.px24,
  },
  groupTitle: {
    ...hds.typeStyles.h3,
    color: 'var(--semantic-color-content-primary)',
    margin: `0 0 ${hds.space.px12}`,
  },

  body: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    margin: `0 0 ${hds.space.px2}`,
  },
  ui: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', margin: 0 },
} satisfies Record<string, CSSProperties>;
