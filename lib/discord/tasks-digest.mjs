/**
 * lib/discord/tasks-digest.mjs — pure formatters behind the Discord bot's
 * `!status` / `!recent` / `!backlog` shortcuts (ops#30).
 *
 * These commands used to parse the repo's `BACKLOG.md`, which was retired
 * (2026-07-06) in favor of GitHub Issues as the source of truth. They now
 * take the same `Task[]` shape `GET /api/tasks` returns (lib/supabase/tasks.mjs
 * rows: status 'open'|'blocked'|'done', lane, tags, updated_at, …) and the
 * `ProjectStatus[]` shape `GET /api/projects` returns (lib/projects/index.mjs).
 *
 * `taskCategories` mirrors src/app/pages/ops/tasks/taskMeta.ts's
 * CATEGORY_PREDICATES (ready/needs-adrian/needs-human/blocked/backlog/parked)
 * so the bot's vocabulary matches the /ops/tasks board an operator already
 * knows — kept as a separate plain-JS copy (not a shared import) since the
 * board is TS and this runs as a bare `node` script with no build step. Keep
 * the two in sync by hand if the board's predicates change.
 *
 * No network, no Date.now(), no fs — every function is data-in/data-out so
 * it's testable with plain fixtures.
 */

const CATEGORY_ORDER = ['ready', 'needs-adrian', 'needs-human', 'blocked', 'backlog', 'parked'];

function hasTag(t, tag) {
  return Array.isArray(t.tags) && t.tags.includes(tag);
}

const CATEGORY_PREDICATES = {
  ready: (t) => hasTag(t, 'ralph-ready'),
  'needs-adrian': (t) => hasTag(t, 'needs-adrian'),
  'needs-human': (t) => hasTag(t, 'needs-human'),
  blocked: (t) => t.status === 'blocked' || hasTag(t, 'blocked'),
  backlog: (t) => hasTag(t, 'backlog'),
  parked: (t) => hasTag(t, 'ralph-parked'),
};

/** Every category (of CATEGORY_ORDER) a task matches — a task can match more than one. */
export function taskCategories(task) {
  return CATEGORY_ORDER.filter((cat) => CATEGORY_PREDICATES[cat](task));
}

/** True iff `task` matches `category` ('all' always matches). */
export function matchesCategory(task, category) {
  return category === 'all' || Boolean(CATEGORY_PREDICATES[category]?.(task));
}

/** Live, non-done tasks (mirrors the board's default "open work" view). */
function openTasks(tasks) {
  return tasks.filter((t) => t.status !== 'done');
}

/**
 * Counts for `!status`: total open, per-status, per-category, and per-lane
 * (repo) with a ready-count so the summary can point at what's actionable.
 */
export function summarizeTasks(tasks) {
  const open = openTasks(tasks);
  const byStatus = { open: 0, blocked: 0, done: tasks.length - open.length };
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0]));
  const laneCounts = new Map(); // lane → { count, ready }

  for (const t of open) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    for (const cat of taskCategories(t)) byCategory[cat] += 1;

    const lane = t.lane || 'uncategorized';
    const entry = laneCounts.get(lane) || { lane, count: 0, ready: 0 };
    entry.count += 1;
    if (CATEGORY_PREDICATES.ready(t)) entry.ready += 1;
    laneCounts.set(lane, entry);
  }

  const byLane = [...laneCounts.values()].sort((a, b) => b.count - a.count);
  return { total: open.length, byStatus, byCategory, byLane };
}

/** One-line-per-ERROR-deployment summary, or null when nothing's on fire. */
export function deployAlertLine(projects) {
  const failing = (projects || []).filter((p) => p.latestDeployment?.state === 'ERROR');
  if (failing.length === 0) return null;
  const names = failing.map((p) => p.name).join(', ');
  return `🔴 **${failing.length} deploy(s) failing:** ${names}`;
}

/** `!status` embed text — live task counts + fleet deploy health + git HEAD. */
export function formatStatusDigest({ tasks, projects, gitBranch, gitShort, providerLine }) {
  const s = summarizeTasks(tasks);
  const lines = [
    `**Status** — \`${gitBranch}\` @ \`${gitShort}\``,
    `📋 **${s.total}** open tasks (GitHub Issues)`,
    `🟢 ready: **${s.byCategory.ready}**  🔴 blocked: **${s.byCategory.blocked}**  ` +
      `🙋 needs-adrian: **${s.byCategory['needs-adrian']}**  ⚪ backlog: **${s.byCategory.backlog}**`,
  ];
  if (providerLine) lines.push('', providerLine);

  const alert = deployAlertLine(projects);
  if (alert) lines.push('', alert);

  if (s.byLane.length > 0) {
    lines.push('', '**By repo:**');
    for (const { lane, count, ready } of s.byLane.slice(0, 10)) {
      lines.push(`• **${lane}** — ${count} (${ready} ready)`);
    }
    if (s.byLane.length > 10) lines.push(`_…+${s.byLane.length - 10} more repos_`);
  }

  lines.push('', '_Use_ `!backlog <repo|category>` _to drill in, or_ `!backlog ready` _for actionable items._');
  return lines.join('\n');
}

/**
 * `!recent [days]` — tasks whose `updated_at` falls within the window,
 * newest first. `now` is caller-supplied (defaults to `Date.now()` at the
 * call site in the bot, never inside this pure function).
 */
export function formatRecentDigest(tasks, { days = 7, now } = {}) {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const recent = tasks
    .filter((t) => t.updated_at && new Date(t.updated_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  if (recent.length === 0) return `No task activity in the last ${days} day(s).`;

  const lines = [`**Task activity (last ${days}d)** — ${recent.length} task(s)`];
  for (const t of recent.slice(0, 15)) {
    const date = t.updated_at.slice(0, 10);
    const flag = t.status === 'done' ? '✅' : t.status === 'blocked' ? '🔴' : '🟢';
    lines.push(`${flag} \`${date}\` **${t.lane}** — ${t.title}`.slice(0, 200));
  }
  if (recent.length > 15) lines.push(`_…+${recent.length - 15} more_`);
  return lines.join('\n');
}

const STATUS_EMOJI = { open: '🟢', blocked: '🔴', done: '✅' };

/**
 * `!backlog [filter]` — no filter: top ready items per repo. Filter matching
 * a known category (ready/blocked/needs-adrian/needs-human/backlog/parked)
 * or 'done': filtered flat list. Otherwise: fuzzy repo/lane match.
 */
export function formatLaneDigest(tasks, filter) {
  if (tasks.length === 0) return 'No tasks loaded from the GitHub Issues feed.';

  const f = (filter || '').trim().toLowerCase();

  if (!f) {
    const open = openTasks(tasks);
    const byLane = new Map();
    for (const t of open) {
      if (!CATEGORY_PREDICATES.ready(t)) continue;
      const arr = byLane.get(t.lane) || [];
      arr.push(t);
      byLane.set(t.lane, arr);
    }
    if (byLane.size === 0) return 'No `ralph-ready` tasks right now.';
    const lines = [`**Backlog digest** — ${open.length} open task(s) total`];
    for (const [lane, arr] of [...byLane.entries()].sort((a, b) => b[1].length - a[1].length)) {
      lines.push('', `**${lane}** (${arr.length} ready)`);
      for (const t of arr.slice(0, 3)) lines.push(`🟢 \`${t.key}\` — ${t.title.slice(0, 80)}`);
      if (arr.length > 3) lines.push(`_…+${arr.length - 3} more in this repo_`);
    }
    lines.push('', '_`!backlog blocked` for blocked items · `!backlog <repo>` to drill in_');
    return lines.join('\n');
  }

  if (f === 'done' || CATEGORY_ORDER.includes(f)) {
    const matches = f === 'done' ? tasks.filter((t) => t.status === 'done') : tasks.filter((t) => matchesCategory(t, f));
    const lines = [`**Backlog: ${matches.length} task(s) — \`${f}\`**`];
    if (matches.length === 0) {
      lines.push('_None._');
    } else {
      const byLane = new Map();
      for (const t of matches) {
        const arr = byLane.get(t.lane) || [];
        arr.push(t);
        byLane.set(t.lane, arr);
      }
      for (const [lane, arr] of byLane) {
        lines.push('', `**${lane}** (${arr.length})`);
        for (const t of arr.slice(0, 8)) lines.push(`${STATUS_EMOJI[t.status] || '⬜'} \`${t.key}\` — ${t.title.slice(0, 80)}`);
        if (arr.length > 8) lines.push(`_…+${arr.length - 8} more_`);
      }
    }
    return lines.join('\n').slice(0, 1900);
  }

  const lanes = [...new Set(tasks.map((t) => t.lane))];
  const lane = lanes.find((l) => l.toLowerCase().includes(f));
  if (!lane) {
    return (
      `No repo matched \`${filter}\`. Try: ${lanes.map((l) => `\`${l}\``).join(', ')}\n` +
      `Or filter by category: ${CATEGORY_ORDER.map((c) => `\`!backlog ${c}\``).join(' · ')}`
    );
  }
  const arr = openTasks(tasks.filter((t) => t.lane === lane));
  const lines = [`**${lane}** (${arr.length} open task(s))`];
  for (const t of arr.slice(0, 15)) lines.push(`${STATUS_EMOJI[t.status] || '⬜'} \`${t.key}\` — ${t.title.slice(0, 80)}`);
  if (arr.length > 15) lines.push(`_…+${arr.length - 15} more in this repo_`);
  return lines.join('\n').slice(0, 1900);
}
