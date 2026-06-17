/**
 * scripts/proposed-skills-middleware.mjs
 *
 * Dev-only HTTP middleware for the `/ops` "new skill" capture seam.
 * Mirrors scripts/proposed-units-middleware.mjs (the proposed-units inbox)
 * but for skill ideas. Adrian describes a skill in natural language; we
 * append one JSONL line to docs/ai/proposed-skills.jsonl. The build step
 * happens later in an interactive Claude Code session — this seam captures
 * intent only and never triggers code generation.
 *
 * Endpoints (mounted at /api/proposed-skills):
 *   GET  → { items: [{ ts, name, description, expectedOutput, requestedBy }],
 *           now: number }
 *   POST → body { name, description, expectedOutput?, requestedBy? }
 *          appends one JSONL line, returns { ok: true, ts, line }
 *
 * Always 200 with `items: []` when the file is missing (mirrors the
 * proposed-units behaviour so the page can render an empty state without
 * erroring). The file is gitignored — it's a local-only append seam.
 *
 * @module proposed-skills-middleware
 */

import { createReadStream, existsSync, promises as fsp } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';

const FILE_REL = 'docs/ai/proposed-skills.jsonl';
// Defensive cap so a stuck client can't append a multi-MB blob and bloat the
// gitignored seam. 8KB is plenty for a name + description + expected output.
const MAX_BODY_BYTES = 8 * 1024;

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readProposedSkills(projectRoot) {
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
        // Minimal shape guard so the page can rely on `name`.
        if (parsed && typeof parsed.name === 'string' && parsed.name.length > 0) {
          out.push(parsed);
        }
      } catch {
        // Skip malformed lines silently — append-only file may have a
        // partially-written tail line during concurrent writes.
      }
    }
  } catch {
    // I/O error mid-stream — return whatever we collected so far.
  }
  return out;
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      // Vite's connect stack delivers Buffer chunks, but tests / arbitrary
      // node streams may deliver strings. Normalize so Buffer.concat works.
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error(`body exceeded ${MAX_BODY_BYTES} bytes`));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sanitizeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  // Collapse whitespace runs to a single space and trim. JSON.stringify
  // escapes any remaining control bytes, so the one-line-per-record JSONL
  // invariant is preserved without custom byte stripping.
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

async function appendProposedSkill(projectRoot, payload) {
  const file = path.join(projectRoot, FILE_REL);
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const line = JSON.stringify(payload) + '\n';
  await fsp.appendFile(file, line, 'utf8');
  return line;
}

/**
 * Build the connect-style middleware.
 *
 * @param {{ projectRoot: string }} opts
 */
export function createProposedSkillsMiddleware({ projectRoot }) {
  return async function proposedSkills(req, res, next) {
    if (req.method === 'GET') {
      let items = [];
      try {
        items = await readProposedSkills(projectRoot);
      } catch {
        items = [];
      }
      return jsonResponse(res, 200, { items, now: Date.now() });
    }

    if (req.method === 'POST') {
      let raw = '';
      try {
        raw = await readBody(req);
      } catch (err) {
        return jsonResponse(res, 413, { ok: false, error: String(err?.message || err) });
      }
      let parsed;
      try {
        parsed = JSON.parse(raw || '{}');
      } catch (err) {
        return jsonResponse(res, 400, {
          ok: false,
          error: `invalid JSON body: ${String(err?.message || err)}`,
        });
      }

      const name = sanitizeString(parsed.name, 80);
      const description = sanitizeString(parsed.description, 1_000);
      const expectedOutput = sanitizeString(parsed.expectedOutput, 1_000);
      const requestedBy = sanitizeString(parsed.requestedBy, 80) || 'adrian';

      if (!name) {
        return jsonResponse(res, 400, { ok: false, error: 'name is required' });
      }
      if (!description) {
        return jsonResponse(res, 400, { ok: false, error: 'description is required' });
      }

      const payload = {
        ts: new Date().toISOString(),
        name,
        description,
        expectedOutput,
        requestedBy,
      };

      try {
        const line = await appendProposedSkill(projectRoot, payload);
        return jsonResponse(res, 200, { ok: true, ts: payload.ts, line: line.trim() });
      } catch (err) {
        return jsonResponse(res, 500, { ok: false, error: String(err?.message || err) });
      }
    }

    return next();
  };
}
