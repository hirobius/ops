#!/usr/bin/env node
/**
 * scripts/metric-human-gate-latency.mjs
 *
 * Human-gate latency metric (ops#297, decided in the ops#274
 * frontier-engineering session, `docs/ai/FRONTIER-DOCTRINE.md` §7 — the
 * second of the two adopted metrics; the first is #293,
 * scripts/metric-north-star-share.mjs).
 *
 * On a one-person agency the loop's capacity is not the constraint —
 * Adrian's decision throughput is. This measures how long an issue actually
 * sits gated on him: days between one of `needs-adrian` / `needs-decision` /
 * `needs-credential` being applied and it being removed (or today, if still
 * applied), broken out per label so a credential backlog doesn't read as a
 * decision backlog.
 *
 * Source of truth is the repo-wide `GET /repos/{owner}/{repo}/issues/events`
 * endpoint (not per-issue timelines) — it returns `labeled`/`unlabeled`
 * events for every issue in one paginated feed, including issues that were
 * gated and later resolved (label removed), which a "search issues with
 * this label" query would miss entirely since it only sees current state.
 *
 * Network required (GitHub REST API) — manual channel only, same as
 * metric-north-star-share and audit-deps.
 *
 * Usage:
 *   node scripts/metric-human-gate-latency.mjs                # human output
 *   node scripts/metric-human-gate-latency.mjs --json          # canonical { violations, summary, ok }
 *   node scripts/metric-human-gate-latency.mjs --target 7      # violation when median > 7 days
 *   node scripts/metric-human-gate-latency.mjs --repo owner/name
 *
 * @module metric-human-gate-latency
 */

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

// ── Gate label definition ────────────────────────────────────────────────────

/** The three labels that mean "an issue is waiting on Adrian" (ops#295 split). */
export const GATE_LABELS = ['needs-adrian', 'needs-decision', 'needs-credential'];

/** Starting instrument threshold, not a calibrated policy — see module header. */
export const DEFAULT_TARGET_DAYS = 7;

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

// ── Interval reconstruction (pure) ───────────────────────────────────────────

/**
 * @typedef {Object} LabelEvent
 * @property {'labeled'|'unlabeled'} event
 * @property {string} label        Label name (only GATE_LABELS entries matter).
 * @property {number} issueNumber
 * @property {string} issueTitle
 * @property {string} issueUrl
 * @property {string} createdAt    ISO timestamp.
 */

/**
 * @typedef {Object} GateInterval
 * @property {number} issueNumber
 * @property {string} issueTitle
 * @property {string} issueUrl
 * @property {string} label
 * @property {string} startedAt   ISO timestamp the label was applied.
 * @property {string|null} endedAt  ISO timestamp it was removed, or null if still gated.
 * @property {number} days        Duration in days (endedAt ?? now).
 */

/**
 * Reconstruct label-applied/label-removed intervals from a flat, unordered
 * event feed. Events are grouped by (issue, label), sorted chronologically,
 * and paired: each `labeled` opens an interval, closed by the next
 * `unlabeled` for that same (issue, label) or left open (`endedAt: null`)
 * if none follows. A stray `unlabeled` with no open interval is ignored —
 * it means the label predates the fetched window.
 *
 * @param {LabelEvent[]} events
 * @param {{ now?: number }} [opts]
 * @returns {GateInterval[]}
 */
export function buildGateIntervals(events, { now = Date.now() } = {}) {
  const gateLabels = new Set(GATE_LABELS);
  const relevant = events.filter((e) => gateLabels.has(e.label));

  const groups = new Map(); // "issueNumber::label" -> LabelEvent[]
  for (const e of relevant) {
    const key = `${e.issueNumber}::${e.label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const intervals = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    let openStart = null;
    for (const e of sorted) {
      if (e.event === 'labeled') {
        if (openStart === null) openStart = e;
      } else if (e.event === 'unlabeled') {
        if (openStart !== null) {
          intervals.push(toInterval(openStart, e.createdAt, now));
          openStart = null;
        }
      }
    }
    if (openStart !== null) intervals.push(toInterval(openStart, null, now));
  }

  return intervals.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

function toInterval(startEvent, endedAt, now) {
  const startedAt = startEvent.createdAt;
  const endMs = endedAt ? Date.parse(endedAt) : now;
  const days = (endMs - Date.parse(startedAt)) / (24 * 60 * 60 * 1000);
  return {
    issueNumber: startEvent.issueNumber,
    issueTitle: startEvent.issueTitle,
    issueUrl: startEvent.issueUrl,
    label: startEvent.label,
    startedAt,
    endedAt,
    days,
  };
}

/** Plain median — even-length lists average the two middle values. */
export function median(numbers) {
  if (numbers.length === 0) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * @param {GateInterval[]} intervals
 * @returns {{
 *   overallMedianDays: number|null,
 *   byLabel: Record<string, { count: number, medianDays: number|null }>,
 *   oldestOpen: GateInterval|null,
 * }}
 */
export function computeStats(intervals) {
  const overallMedianDays = median(intervals.map((i) => i.days));

  const byLabel = {};
  for (const label of GATE_LABELS) {
    const days = intervals.filter((i) => i.label === label).map((i) => i.days);
    byLabel[label] = { count: days.length, medianDays: median(days) };
  }

  const open = intervals.filter((i) => i.endedAt === null);
  const oldestOpen = open.length
    ? open.reduce((oldest, i) => (i.days > oldest.days ? i : oldest))
    : null;

  return { overallMedianDays, byLabel, oldestOpen };
}

/**
 * Canonical-shape violations for the computed stats. No gated issues yet →
 * no violations (no data, not "fast"). Median at/below target → none.
 * Above target → exactly one, so `ralph/metric.sh` can drive off it.
 */
export function buildViolations({ overallMedianDays, targetDays = DEFAULT_TARGET_DAYS }) {
  if (overallMedianDays === null || overallMedianDays <= targetDays) return [];
  return [
    {
      file: '*',
      line: null,
      rule: 'HUMAN_GATE_LATENCY_ABOVE_TARGET',
      severity: 'warn',
      message: `human-gate median latency ${overallMedianDays.toFixed(1)}d is above target ${targetDays}d`,
    },
  ];
}

/** The human-readable summary the DoD asks for: median + oldest open, per label. */
export function formatHuman({ overallMedianDays, byLabel, oldestOpen }) {
  const lines = [];
  lines.push(
    `human-gate latency: median ${overallMedianDays === null ? 'n/a' : `${overallMedianDays.toFixed(1)}d`} across ${GATE_LABELS.join(', ')}`,
  );
  for (const label of GATE_LABELS) {
    const { count, medianDays } = byLabel[label];
    lines.push(
      `  ${label}: median ${medianDays === null ? 'n/a' : `${medianDays.toFixed(1)}d`} (${count} episode${count === 1 ? '' : 's'})`,
    );
  }
  lines.push(
    oldestOpen
      ? `  oldest open: #${oldestOpen.issueNumber} "${oldestOpen.issueTitle}" — ${oldestOpen.days.toFixed(1)}d on ${oldestOpen.label}`
      : `  oldest open: none currently gated`,
  );
  return lines.join('\n');
}

// ── GitHub fetch (network) ───────────────────────────────────────────────────

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hirobius-ops',
});

function authHint(status) {
  return (
    `GitHub returned ${status}. GITHUB_TOKEN is expired, revoked, or missing the ` +
    `"Issues: read" permission — rotate it at ${GITHUB_TOKEN_URL}, then set it in ` +
    `Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL} and redeploy.`
  );
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const m = /<([^>]+)>;\s*rel="next"/.exec(part);
    if (m) return m[1];
  }
  return null;
}

const MAX_EVENT_PAGES = 20; // 20 × 100 = 2000 repo-wide issue events

/**
 * Fetch `labeled`/`unlabeled` events for `GATE_LABELS` across the whole
 * repo, via the repo-wide issue-events feed (not per-issue timelines — see
 * module header for why). `fetchImpl` is injectable (defaults to global
 * `fetch`) so tests can stub the API client without network (ops#297 DoD).
 *
 * @returns {Promise<LabelEvent[]>}
 */
export async function fetchGateLabelEvents({
  repo,
  token,
  fetchImpl = fetch,
  maxPages = MAX_EVENT_PAGES,
}) {
  const gateLabels = new Set(GATE_LABELS);
  let url = `https://api.github.com/repos/${repo}/issues/events?per_page=100`;
  const events = [];
  let page = 0;
  while (url) {
    page += 1;
    const res = await fetchImpl(url, {
      headers: GH_HEADERS(token),
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `HTTP ${res.status} fetching issue events${text ? ` — ${text.slice(0, 300)}` : ''}`,
      );
    }
    const body = await res.json();
    for (const raw of body) {
      if (raw.event !== 'labeled' && raw.event !== 'unlabeled') continue;
      const labelName = raw.label?.name;
      if (!labelName || !gateLabels.has(labelName)) continue;
      if (!raw.issue) continue;
      events.push({
        event: raw.event,
        label: labelName,
        issueNumber: raw.issue.number,
        issueTitle: raw.issue.title,
        issueUrl: raw.issue.html_url,
        createdAt: raw.created_at,
      });
    }
    const next = parseNextLink(res.headers.get('link'));
    url = next && page < maxPages ? next : null;
  }
  return events;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function numFlag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

function strFlag(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1 || i === argv.length - 1) return fallback;
  return argv[i + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = hasJsonFlag(argv);
  const targetDays = numFlag(argv, '--target', DEFAULT_TARGET_DAYS);
  const repo = strFlag(argv, '--repo', process.env.GITHUB_REPO || 'hirobius/ops');

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error(
      `GITHUB_TOKEN is not set — needed to read issue label history for the human-gate ` +
        `latency metric. Set it in Vercel → Settings → Environment Variables (Production) ` +
        `at ${VERCEL_ENV_URL}, then redeploy. (A fine-grained token with "Issues: read" works: ` +
        `${GITHUB_TOKEN_URL}.)`,
    );
    process.exit(1);
    return;
  }

  let events;
  try {
    events = await fetchGateLabelEvents({ repo, token });
  } catch (err) {
    console.error(`metric-human-gate-latency: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
    return;
  }

  const intervals = buildGateIntervals(events);
  const { overallMedianDays, byLabel, oldestOpen } = computeStats(intervals);
  const violations = buildViolations({ overallMedianDays, targetDays });
  const result = {
    violations,
    summary: {
      overallMedianDays,
      byLabel,
      oldestOpen,
      targetDays,
      repo,
      episodeCount: intervals.length,
    },
    ok: true, // informational metric — never fails its own run; see module header
  };

  if (jsonMode) {
    emitResult(result, true);
  } else {
    console.log(formatHuman({ overallMedianDays, byLabel, oldestOpen }));
    if (violations.length) console.log(`  ${violations[0].message}`);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
