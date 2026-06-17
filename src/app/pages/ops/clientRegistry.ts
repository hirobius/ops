/**
 * Manifest-driven client registry. Vite's import.meta.glob auto-discovers
 * every clients/<slug>/{meta,tasks,checklist,retainer}.json at build time;
 * this module joins them into a single CLIENT_REGISTRY map keyed by slug.
 *
 * Shared between OpsDashboardPage and SessionsPage so both surfaces see
 * the same client data without re-reading the file system twice.
 */

import type {
  ClientFiles,
  ClientMeta,
  ClientTasksFile,
  ClientChecklistFile,
  ClientRetainerFile,
} from './clientTypes';

const _metas   = import.meta.glob<{ default: ClientMeta }>('../../../../clients/*/meta.json',      { eager: true });
const _tasks   = import.meta.glob<{ default: ClientTasksFile }>('../../../../clients/*/tasks.json',     { eager: true });
const _checks  = import.meta.glob<{ default: ClientChecklistFile }>('../../../../clients/*/checklist.json', { eager: true });
const _retains = import.meta.glob<{ default: ClientRetainerFile }>('../../../../clients/*/retainer.json',  { eager: true });

function slugOf(p: string) { return p.match(/clients\/([^/]+)\//)?.[1] ?? ''; }

export const CLIENT_REGISTRY: Record<string, ClientFiles> = {};
for (const [p, m] of Object.entries(_metas))   { const s = slugOf(p); if (s) CLIENT_REGISTRY[s] = { meta: m.default }; }
for (const [p, m] of Object.entries(_tasks))   { const s = slugOf(p); if (s && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].tasks     = m.default; }
for (const [p, m] of Object.entries(_checks))  { const s = slugOf(p); if (s && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].checklist = m.default; }
for (const [p, m] of Object.entries(_retains)) { const s = slugOf(p); if (s && CLIENT_REGISTRY[s]) CLIENT_REGISTRY[s].retainer  = m.default; }

export const CLIENT_SLUGS = Object.keys(CLIENT_REGISTRY).sort();
