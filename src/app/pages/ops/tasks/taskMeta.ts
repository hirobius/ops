/**
 * taskMeta — pure helpers behind the /ops/tasks board (ops#136).
 *
 * Everything here is data-in/data-out so the board's operator logic (what
 * outranks what, how rows group, which chip tone a field gets) is unit-tested
 * independently of rendering. `now` is always caller-supplied — no Date.now()
 * inside.
 */

import type { Task } from './types';

export type GroupBy = 'lane' | 'priority' | 'due' | 'status';
export type ChipTone = 'success' | 'neutral' | 'warning' | 'danger';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/**
 * True when a task was imported from a GitHub repo outside the hirobius org —
 * the Ralph loop only runs in hirobius repos, so these rows are visibly
 * outside the autonomous lifecycle ("no Ralph" chip).
 */
export function isNoRalphSource(source: string): boolean {
  const m = /^github:([^/]+)\//.exec(source);
  return !!m && m[1] !== 'hirobius';
}

/**
 * The `owner/repo#N` GitHub ref for a task, or null if it isn't issue-backed.
 * Imported issues carry it in their key (`github:<owner>/<repo>#<n>`); dispatched
 * tasks carry an issue URL in `dispatch_url`. Powers the multi-select "Copy refs"
 * batch action (folded in from the retired /ops/issues surface).
 */
export function taskRef(t: Task): string | null {
  if (t.key.startsWith('github:')) return t.key.slice('github:'.length);
  const m = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/.exec(t.dispatch_url ?? '');
  return m ? `${m[1]}/${m[2]}#${m[3]}` : null;
}

const PRIORITY_RANK: Record<string, number> = { high: 0, med: 1, low: 2 };

function priorityRank(t: Task): number {
  return t.priority != null ? (PRIORITY_RANK[t.priority] ?? 3) : 3;
}

function dueMs(t: Task): number {
  if (!t.due) return Number.POSITIVE_INFINITY; // no due sorts last
  const ms = new Date(t.due).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** Operator order: priority (high→low→none), then due date (earliest first, none last). */
export function compareTasks(a: Task, b: Task): number {
  const p = priorityRank(a) - priorityRank(b);
  if (p !== 0) return p;
  const d = dueMs(a) - dueMs(b);
  if (d !== 0) return Number.isNaN(d) ? 0 : Math.sign(d);
  return 0; // stable sort preserves API order (sort_order)
}

function dueBucket(t: Task, now: number): string {
  if (!t.due) return 'no due';
  const ms = dueMs(t);
  if (!Number.isFinite(ms)) return 'no due';
  if (ms < now) return 'overdue';
  if (ms <= now + WEEK_MS) return 'this week';
  return 'later';
}

const GROUP_ORDERS: Partial<Record<GroupBy, string[]>> = {
  priority: ['high', 'med', 'low', 'no priority'],
  due: ['overdue', 'this week', 'later', 'no due'],
  status: ['open', 'blocked', 'done'],
};

function groupLabel(t: Task, groupBy: GroupBy, now: number): string {
  switch (groupBy) {
    case 'lane':
      return t.lane;
    case 'priority':
      return t.priority ?? 'no priority';
    case 'due':
      return dueBucket(t, now);
    case 'status':
      return t.status;
  }
}

/**
 * Group + sort tasks for the board. Groups follow a fixed label order where the
 * dimension has one (priority/due/status); lane grouping preserves first-seen
 * order (existing behavior). Empty groups are omitted; rows within a group are
 * in operator order (compareTasks).
 */
export function groupTasks(tasks: Task[], groupBy: GroupBy, now: number): [string, Task[]][] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const label = groupLabel(t, groupBy, now);
    const arr = map.get(label);
    if (arr) arr.push(t);
    else map.set(label, [t]);
  }
  const order = GROUP_ORDERS[groupBy];
  const entries = [...map.entries()];
  if (order) entries.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  for (const [, ts] of entries) ts.sort(compareTasks);
  return entries;
}

/**
 * Render-time wrapper: groupTasks against the current clock. The pure,
 * `now`-injected version above is the tested seam; this keeps the impure
 * Date.now() call out of component render (react-hooks/purity).
 */
export function groupTasksNow(tasks: Task[], groupBy: GroupBy): [string, Task[]][] {
  return groupTasks(tasks, groupBy, Date.now());
}

export function priorityTone(priority: NonNullable<Task['priority']>): ChipTone {
  return priority === 'high' ? 'danger' : priority === 'med' ? 'warning' : 'neutral';
}

/** Tone for the due chip: overdue=danger, due within 7 days=warning, later=neutral. */
export function dueTone(due: string | null, now: number): ChipTone | null {
  if (!due) return null;
  const ms = new Date(due).getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms < now) return 'danger';
  if (ms <= now + WEEK_MS) return 'warning';
  return 'neutral';
}

/** Render-time wrapper over dueTone — see groupTasksNow. */
export function dueToneNow(due: string | null): ChipTone | null {
  return dueTone(due, Date.now());
}

/** Render-time "x ago" freshness stamp (same idiom as the page's other formatters). */
export function relTimeNow(iso: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
