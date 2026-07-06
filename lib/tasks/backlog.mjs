/**
 * lib/tasks/backlog.mjs — parse BACKLOG.md into `tasks`-table rows.
 *
 * BACKLOG.md is the human source of truth for open work. This turns its
 * `## Area` sections and `- \`badge\` **key** — description` items into rows the
 * importer upserts into Supabase (source='backlog', key='backlog:<native>').
 *
 * Pure: takes the markdown string, returns row objects. No fs, no DB — so it's
 * shared by the build-time generator and unit tests.
 */

/** Area heading → [lane slug, readable group]. */
const AREA_LANE = {
  'Portfolio (adrianmilsap.com)': ['portfolio', 'Portfolio'],
  'Concrete Creations': ['concrete', 'Concrete Creations'],
  'Client Work': ['client-work', 'Client Work'],
  'HDS / Design System': ['hds', 'HDS / Design System'],
  'Ops / Agents': ['ops', 'Ops / Agents'],
  'Security / Compliance': ['security', 'Security / Compliance'],
  'Other / Uncategorized': ['other', 'Other / Uncategorized'],
};

/** Backlog badge → canonical task_status enum. */
const STATUS = {
  ready: 'open',
  idea: 'open',
  parked: 'open',
  'needs-grilling': 'open',
  blocked: 'blocked',
};

const MAX_TITLE = 240;

/**
 * @param {string} md  contents of BACKLOG.md
 * @returns {Array<{key,source,native_key,lane,group,title,status,raw_status,tags,sort_order}>}
 */
export function parseBacklog(md) {
  let lane = 'other';
  let group = 'Other / Uncategorized';
  let order = 0;
  const rows = [];

  for (const raw of String(md).split('\n')) {
    const heading = raw.match(/^##\s+(.*?)\s*(?:_\(\d+\)_)?\s*$/);
    if (heading && AREA_LANE[heading[1].trim()]) {
      [lane, group] = AREA_LANE[heading[1].trim()];
      continue;
    }
    // - `badge` **key** — description
    const item = raw.match(/^-\s+`([^`]+)`\s+\*\*(.+?)\*\*\s*[—-]+\s*(.*)$/);
    if (!item) continue;

    const badge = item[1].trim();
    const nativeKey = item[2].trim();
    const desc = item[3].trim();
    order += 1;

    rows.push({
      key: `backlog:${nativeKey}`,
      source: 'backlog',
      native_key: nativeKey,
      lane,
      group,
      title: desc.length > MAX_TITLE ? `${desc.slice(0, MAX_TITLE - 1)}…` : desc,
      status: STATUS[badge] || 'open',
      raw_status: badge,
      tags: badge === 'idea' ? ['idea'] : [],
      sort_order: order,
    });
  }

  return rows;
}
