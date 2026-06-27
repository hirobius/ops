/**
 * Manifest-driven client registry. Vite's import.meta.glob auto-discovers the
 * clients/<slug>/*.json files at build time; this module joins them into a map.
 *
 * - buildClientRegistry(): the shared assembler used by ClientDashboardPage and
 *   ClientReportPage, which glob a wider 7-file set. The import.meta.glob calls
 *   must live in the consuming module to be statically analysed, so each page owns
 *   its globs and passes the results here (this is why the assembly used to be
 *   copy-pasted into both pages).
 * - CLIENT_REGISTRY: the narrower 4-file set (meta/tasks/checklist/retainer) shared
 *   by OpsDashboardPage + SessionsPage. Kept as its own inline assembly to preserve
 *   its exact current behaviour (notably its slug guard).
 */

import type {
  ClientFiles,
  ClientMeta,
  ClientTasksFile,
  ClientChecklistFile,
  ClientRetainerFile,
  ClientGoalsFile,
  ClientAutomationConfig,
  ClientWorkflowConfig,
} from './clientTypes';

type Glob<T> = Record<string, { default: T }>;

export interface ClientGlobs {
  metas: Glob<ClientMeta>;
  tasks?: Glob<ClientTasksFile>;
  checks?: Glob<ClientChecklistFile>;
  retains?: Glob<ClientRetainerFile>;
  goals?: Glob<ClientGoalsFile>;
  autoCfgs?: Glob<ClientAutomationConfig>;
  workflows?: Glob<ClientWorkflowConfig>;
}

function slugOf(p: string) {
  return p.match(/clients\/([^/]+)\//)?.[1] ?? '';
}
function workflowOf(p: string) {
  const m = p.match(/clients\/([^/]+)\/automations\/([^/]+)\/config\.json/);
  return m ? { slug: m[1], workflowId: m[2] } : null;
}
/** Skip slugs starting with `_` (e.g. `_template/`) — scaffolding, not real clients. */
function shouldRegister(slug: string) {
  return Boolean(slug) && !slug.startsWith('_');
}

/**
 * Join already-globbed client files into a registry keyed by slug. Pure — callers
 * own the import.meta.glob calls so Vite can statically analyse them.
 */
export function buildClientRegistry(globs: ClientGlobs): Record<string, ClientFiles> {
  const reg: Record<string, ClientFiles> = {};
  for (const [p, m] of Object.entries(globs.metas)) {
    const s = slugOf(p);
    if (shouldRegister(s)) reg[s] = { meta: m.default };
  }
  for (const [p, m] of Object.entries(globs.tasks ?? {})) {
    const s = slugOf(p);
    if (shouldRegister(s) && reg[s]) reg[s].tasks = m.default;
  }
  for (const [p, m] of Object.entries(globs.checks ?? {})) {
    const s = slugOf(p);
    if (shouldRegister(s) && reg[s]) reg[s].checklist = m.default;
  }
  for (const [p, m] of Object.entries(globs.retains ?? {})) {
    const s = slugOf(p);
    if (shouldRegister(s) && reg[s]) reg[s].retainer = m.default;
  }
  for (const [p, m] of Object.entries(globs.goals ?? {})) {
    const s = slugOf(p);
    if (shouldRegister(s) && reg[s]) reg[s].goals = m.default;
  }
  for (const [p, m] of Object.entries(globs.autoCfgs ?? {})) {
    const s = slugOf(p);
    if (shouldRegister(s) && reg[s]) reg[s].automationConfig = m.default;
  }
  for (const [p, m] of Object.entries(globs.workflows ?? {})) {
    const r = workflowOf(p);
    if (!r || !shouldRegister(r.slug) || !reg[r.slug]) continue;
    reg[r.slug].workflows = [...(reg[r.slug].workflows ?? []), { id: r.workflowId, config: m.default }];
  }
  for (const slug of Object.keys(reg)) {
    if (reg[slug].workflows) reg[slug].workflows!.sort((a, b) => a.id.localeCompare(b.id));
  }
  return reg;
}

// ── 4-file registry for OpsDashboardPage + SessionsPage (unchanged behaviour) ────
const _metas   = import.meta.glob<{ default: ClientMeta }>('../../../../clients/*/meta.json',      { eager: true });
const _tasks   = import.meta.glob<{ default: ClientTasksFile }>('../../../../clients/*/tasks.json',     { eager: true });
const _checks  = import.meta.glob<{ default: ClientChecklistFile }>('../../../../clients/*/checklist.json', { eager: true });
const _retains = import.meta.glob<{ default: ClientRetainerFile }>('../../../../clients/*/retainer.json',  { eager: true });

export const CLIENT_REGISTRY: Record<string, ClientFiles> = {};
for (const [p, m] of Object.entries(_metas))   { const s = slugOf(p); if (s) CLIENT_REGISTRY[s] = { meta: m.default }; }
for (const [p, m] of Object.entries(_tasks))   { const s = slugOf(p); if (s && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].tasks     = m.default; }
for (const [p, m] of Object.entries(_checks))  { const s = slugOf(p); if (s && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].checklist = m.default; }
for (const [p, m] of Object.entries(_retains)) { const s = slugOf(p); if (s && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].retainer  = m.default; }

export const CLIENT_SLUGS = Object.keys(CLIENT_REGISTRY).sort();
