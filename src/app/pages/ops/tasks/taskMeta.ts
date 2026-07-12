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

/**
 * Routing/readiness categories the board can filter by (ops triage vocabulary).
 * These are label-borne (GitHub labels sync into `tags` on import), NOT the
 * derived work-state — an operator filters by the label they actually applied
 * ("show me everything needing me", "everything still backlog"). `all` is the
 * no-op pass-through. Membership is not exclusive: a `backlog`+`ralph-ready`
 * issue matches both `backlog` and `ready`.
 */
export type TaskCategory =
  | 'all'
  | 'ready'
  | 'needs-adrian'
  | 'needs-human'
  | 'blocked'
  | 'backlog'
  | 'parked';

export const TASK_CATEGORIES: TaskCategory[] = [
  'all',
  'ready',
  'needs-adrian',
  'needs-human',
  'blocked',
  'backlog',
  'parked',
];

function hasTag(t: Task, tag: string): boolean {
  return Array.isArray(t.tags) && t.tags.includes(tag);
}

const CATEGORY_PREDICATES: Record<Exclude<TaskCategory, 'all'>, (t: Task) => boolean> = {
  ready: (t) => hasTag(t, 'ralph-ready'),
  'needs-adrian': (t) => hasTag(t, 'needs-adrian'),
  'needs-human': (t) => hasTag(t, 'needs-human'),
  // `blocked` lives as either the status column (tracker rows) or a GitHub
  // label (imported issues keep status='open'), so honour both.
  blocked: (t) => t.status === 'blocked' || hasTag(t, 'blocked'),
  backlog: (t) => hasTag(t, 'backlog'),
  parked: (t) => hasTag(t, 'ralph-parked'),
};

/** True when a task belongs to the given category (`all` always matches). */
export function matchesCategory(t: Task, category: TaskCategory): boolean {
  return category === 'all' || CATEGORY_PREDICATES[category](t);
}

// ─── Card chip taxonomy (ops#158/#138) ───────────────────────────────────────
// The card face carries a deliberate hierarchy, not a flat sticker strip:
//   1. ONE leading priority chip (priorityChip)
//   2. the work-state phase badge (deriveWorkState, rendered in TaskRow)
//   3. only the routing/automation labels that change what happens next
//      (cardLabelTags) — GitHub taxonomy labels are noise on an action board.

export type PriorityChip = { label: string; tone: ChipTone };

const P_LABEL_TONE: Record<LabelPriority, ChipTone> = {
  p0: 'danger',
  p1: 'warning',
  p2: 'neutral',
  p3: 'neutral',
};

/**
 * The single leading priority chip for a card: the p0–p3 label first (the fleet
 * scale), else the legacy DB priority word. Null when the task has neither, so
 * the slot simply collapses. Kept separate from the label chips so priority is
 * always in the same position at the same weight.
 */
export function priorityChip(t: Task): PriorityChip | null {
  const lp = labelPriority(t);
  if (lp) return { label: lp.toUpperCase(), tone: P_LABEL_TONE[lp] };
  if (t.priority) return { label: t.priority.toUpperCase(), tone: priorityTone(t.priority) };
  return null;
}

// Already surfaced elsewhere on the card, so never re-rendered as a generic chip:
//   PHASE_TAGS → the work-state phase badge · PRIORITY_TAGS → the priority chip.
const PHASE_TAGS = new Set(['ralph-ready', 'ralph-wip', 'ralph-parked', 'needs-adrian', 'backlog']);
const PRIORITY_TAGS = new Set(['p0', 'p1', 'p2', 'p3']);
// GitHub type/triage taxonomy — the title prefix (feat/fix/chore) and the
// board's own axes already convey this; as chips they only add visual noise.
const TAXONOMY_TAGS = new Set([
  'bug',
  'chore',
  'enhancement',
  'feature',
  'docs',
  'documentation',
  'design-system',
  'triage',
  'question',
  'duplicate',
  'wontfix',
  'invalid',
  'help wanted',
]);
const TAXONOMY_PREFIXES = ['epic:', 'area:', 'status:'];

/**
 * The labels worth a chip on the card face: routing/automation signals
 * (needs-human, ralph-auto, ralph-approved, and any unrecognised custom label),
 * minus the ones already shown as the phase badge or priority chip, minus the
 * GitHub taxonomy noise. Order is preserved.
 */
export function cardLabelTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return [];
  return tags.filter(
    (t) =>
      !PHASE_TAGS.has(t) &&
      !PRIORITY_TAGS.has(t) &&
      !TAXONOMY_TAGS.has(t) &&
      !TAXONOMY_PREFIXES.some((p) => t.startsWith(p)),
  );
}

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

/**
 * The GitHub issue URL to link a card title to, or null if the task isn't
 * issue-backed. `dispatch_url` (set once Ralph dispatches) wins over
 * `source_url` (the import-time provenance link) — see ops#156.
 */
export function issueLinkFor(t: Task): string | null {
  return t.dispatch_url ?? t.source_url ?? null;
}

export type LabelPriority = 'p0' | 'p1' | 'p2' | 'p3';

const LABEL_PRIORITIES: LabelPriority[] = ['p0', 'p1', 'p2', 'p3'];

/**
 * The p0–p3 priority a task carries as a GitHub label (labels sync into `tags`
 * on import). This is the fleet's real priority signal — the Ralph selector and
 * the board both order by it — whereas the legacy DB `priority` column
 * (high/med/low) is only ever set on old tracker rows, never on imported
 * issues. Highest wins if a row somehow carries more than one. Null when none.
 */
export function labelPriority(t: Task): LabelPriority | null {
  if (!Array.isArray(t.tags)) return null;
  return LABEL_PRIORITIES.find((p) => t.tags!.includes(p)) ?? null;
}

const LABEL_RANK: Record<LabelPriority, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
const DB_RANK: Record<string, number> = { high: 0, med: 1, low: 2 };

/**
 * Unified priority rank (lower = more urgent): the p0–p3 label wins, else the
 * legacy DB priority, else last. p0/high share rank 0 etc. — the two scales
 * don't co-occur on a live row, so this only has to order each on its own.
 */
function priorityRank(t: Task): number {
  const lp = labelPriority(t);
  if (lp) return LABEL_RANK[lp];
  return t.priority != null ? (DB_RANK[t.priority] ?? 8) : 9;
}

/** The group-by-priority bucket label: p0–p3 label first, else DB priority, else none. */
function priorityBucket(t: Task): string {
  return labelPriority(t) ?? t.priority ?? 'no priority';
}

function dueMs(t: Task): number {
  if (!t.due) return Number.POSITIVE_INFINITY; // no due sorts last
  const ms = new Date(t.due).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

/** Operator order: priority (p0→p3 label, else DB high→low, none last), then due date (earliest first). */
export function compareTasks(a: Task, b: Task): number {
  const p = priorityRank(a) - priorityRank(b);
  if (p !== 0) return p;
  const d = dueMs(a) - dueMs(b);
  if (d !== 0) return Number.isNaN(d) ? 0 : Math.sign(d);
  return 0; // stable sort preserves API order (sort_order)
}

type DueClass = 'overdue' | 'week' | 'later';

/**
 * One classifier feeds both the due-grouping bucket and the due-chip tone so
 * they can never disagree. A `YYYY-MM-DD` due date parses to UTC midnight, so
 * the deadline is treated as END of that day — a task due today is "due", not
 * overdue.
 */
function classifyDue(due: string | null, now: number): DueClass | null {
  if (!due) return null;
  const ms = new Date(due).getTime();
  if (!Number.isFinite(ms)) return null;
  if (ms + DAY_MS <= now) return 'overdue';
  if (ms <= now + WEEK_MS) return 'week';
  return 'later';
}

const DUE_BUCKET: Record<DueClass, string> = {
  overdue: 'overdue',
  week: 'this week',
  later: 'later',
};

const DUE_TONE: Record<DueClass, ChipTone> = {
  overdue: 'danger',
  week: 'warning',
  later: 'neutral',
};

function dueBucket(t: Task, now: number): string {
  const c = classifyDue(t.due, now);
  return c ? DUE_BUCKET[c] : 'no due';
}

const GROUP_ORDERS: Partial<Record<GroupBy, string[]>> = {
  // p0–p3 (the fleet label scale) first, then the legacy high/med/low for any
  // old tracker rows that still carry it; empty buckets are omitted at render.
  priority: ['p0', 'p1', 'p2', 'p3', 'high', 'med', 'low', 'no priority'],
  due: ['overdue', 'this week', 'later', 'no due'],
  status: ['open', 'blocked', 'done'],
};

function groupLabel(t: Task, groupBy: GroupBy, now: number): string {
  switch (groupBy) {
    case 'lane':
      return t.lane;
    case 'priority':
      return priorityBucket(t);
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
  const c = classifyDue(due, now);
  return c ? DUE_TONE[c] : null;
}

/** Render-time wrapper over dueTone — see groupTasksNow. */
export function dueToneNow(due: string | null): ChipTone | null {
  return dueTone(due, Date.now());
}

const RECENTLY_COMPLETED_WINDOW_MS = 24 * 60 * 60 * 1000;
const RECENTLY_COMPLETED_MAX = 5;

/**
 * Tasks the live dispatch poller (ops#107) just finished — `completed_at` set
 * within the last 24h — newest first, capped at 5. Independent of the board's
 * status/category filters so a just-finished task doesn't vanish from view the
 * moment it flips to 'done' and drops out of the default 'open' filter.
 */
export function recentlyCompletedTasks(tasks: Task[], now: number): Task[] {
  return tasks
    .filter((t) => {
      if (!t.completed_at) return false;
      const ms = new Date(t.completed_at).getTime();
      return Number.isFinite(ms) && now - ms <= RECENTLY_COMPLETED_WINDOW_MS;
    })
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
    .slice(0, RECENTLY_COMPLETED_MAX);
}

/** Render-time wrapper over recentlyCompletedTasks — see groupTasksNow. */
export function recentlyCompletedTasksNow(tasks: Task[]): Task[] {
  return recentlyCompletedTasks(tasks, Date.now());
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
