/**
 * scripts/research-feed-middleware.mjs
 *
 * Dev-only HTTP middleware: GET /api/research-feed
 * Returns a flat, time-sorted list of recent auto-research findings so the
 * /ops "Research" disclosure can render a feed without parsing markdown
 * frontmatter on the client.
 *
 * Source of truth: docs/research/queries.json + docs/research/findings/<id>/*.md
 *
 * Findings are markdown with YAML-ish frontmatter written by
 * scripts/auto-research.mjs. We extract the frontmatter (id, topic, ts,
 * model, duration_ms) plus the first ~400 chars of the body as a teaser.
 *
 * Read-only filesystem scan; no Ollama call. Capped at 50 most-recent
 * findings across all queries to keep the response fast.
 *
 * @module research-feed-middleware
 */

import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';

const QUERIES_REL = 'docs/research/queries.json';
const FINDINGS_REL = 'docs/research/findings';
const MAX_ITEMS = 50;
const TEASER_CHARS = 400;

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Pull `key: value` pairs from a `---`-delimited YAML-ish block at the top
 * of a markdown file. Mirrors the parser in cc-plugins-middleware.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Strip frontmatter + leading title line from a finding body, return the
 * first TEASER_CHARS of plain content.
 *
 * @param {string} content
 */
function extractTeaser(content) {
  let body = content;
  const fmEnd = content.indexOf('\n---\n', 4);
  if (content.startsWith('---\n') && fmEnd !== -1) {
    body = content.slice(fmEnd + 5);
  }
  // Drop the first H1 + blank lines so the teaser is real content.
  body = body
    .replace(/^\s*#\s+.*\n/, '')
    .replace(/^\s*\*Run:[^\n]*\n/, '')
    .trimStart();
  if (body.length <= TEASER_CHARS) return body.trim();
  return body.slice(0, TEASER_CHARS).trim() + '…';
}

/**
 * @param {string} root
 * @returns {Promise<Array<{ id: string; topic?: string; enabled?: boolean; schedule?: string }>>}
 */
async function readQueries(root) {
  const file = path.join(root, QUERIES_REL);
  if (!existsSync(file)) return [];
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.queries)) return [];
    return parsed.queries.map((q) => ({
      id: q.id,
      topic: q.topic,
      enabled: q.enabled !== false,
      schedule: q.schedule,
    }));
  } catch {
    return [];
  }
}

/**
 * @param {string} root
 * @returns {Promise<Array<{
 *   id: string;
 *   topic: string;
 *   ts: string;
 *   model: string;
 *   durationMs: number;
 *   teaser: string;
 *   file: string;
 * }>>}
 */
async function readFindings(root) {
  const findingsRoot = path.join(root, FINDINGS_REL);
  if (!existsSync(findingsRoot)) return [];
  let queryDirs = [];
  try {
    queryDirs = await fsp.readdir(findingsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const items = [];
  for (const entry of queryDirs) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(findingsRoot, entry.name);
    let files = [];
    try {
      files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const content = await fsp.readFile(full, 'utf8');
        const fm = parseFrontmatter(content);
        items.push({
          id: fm.id ?? entry.name,
          topic: fm.topic ?? entry.name,
          ts: fm.ts ?? '',
          model: fm.model ?? '',
          durationMs: Number(fm.duration_ms) || 0,
          teaser: extractTeaser(content),
          file: path.relative(root, full),
        });
      } catch {
        // Unreadable file — skip silently.
      }
    }
  }
  // Sort by ts (ISO strings sort lexically) descending, cap.
  items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return items.slice(0, MAX_ITEMS);
}

/**
 * @param {{ projectRoot: string }} opts
 */
export function createResearchFeedMiddleware({ projectRoot }) {
  return async function researchFeed(req, res, next) {
    if (req.method !== 'GET') return next();
    try {
      const [queries, findings] = await Promise.all([
        readQueries(projectRoot),
        readFindings(projectRoot),
      ]);
      jsonResponse(res, 200, {
        queries,
        findings,
        now: Date.now(),
      });
    } catch (err) {
      jsonResponse(res, 500, {
        queries: [],
        findings: [],
        error: String(err?.message || err),
      });
    }
  };
}
