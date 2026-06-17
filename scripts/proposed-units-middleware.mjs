/**
 * scripts/proposed-units-middleware.mjs
 *
 * Dev-only HTTP middleware that surfaces docs/ai/proposed-units.jsonl —
 * the append-only seam where dispatched agents propose new units that
 * haven't been promoted to Hermes tasks yet — to the /ops/kanban page.
 *
 * Mounted at GET /api/proposed-units. Returns:
 *
 *   {
 *     items: [{ ts, fromUnitId, reason, urgency, proposedUnit: {...} }],
 *     now: number,
 *   }
 *
 * Always 200 with `items: []` when the file is missing or unreadable, so
 * the page can render the disclosure as "backlog · 0" without erroring.
 *
 * @module proposed-units-middleware
 */

import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';

const FILE_REL = 'docs/ai/proposed-units.jsonl';

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readProposedUnits(projectRoot) {
  const file = path.join(projectRoot, FILE_REL);
  if (!existsSync(file)) return [];
  const out = [];
  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        // Minimal shape guard so the page can rely on `proposedUnit.id`.
        if (parsed && parsed.proposedUnit && typeof parsed.proposedUnit.id === 'string') {
          out.push(parsed);
        }
      } catch {
        // Skip malformed lines silently — append-only file may have a
        // partially-written tail line during agent writes.
      }
    }
  } catch {
    // I/O error mid-stream — return whatever we collected so far.
  }
  return out;
}

/**
 * Build the connect-style middleware.
 *
 * @param {{ projectRoot: string }} opts
 */
export function createProposedUnitsMiddleware({ projectRoot }) {
  return async function proposedUnits(req, res, next) {
    if (req.method !== 'GET') return next();
    let items = [];
    try {
      items = await readProposedUnits(projectRoot);
    } catch {
      items = [];
    }
    jsonResponse(res, 200, { items, now: Date.now() });
  };
}
