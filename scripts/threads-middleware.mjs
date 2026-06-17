/**
 * scripts/threads-middleware.mjs
 *
 * Dev-only HTTP middleware that surfaces "open work threads" to the
 * /ops/kanban page so it can correlate Hermes tasks with Adrian's git
 * worktrees and active Claude Code sessions.
 *
 * Mounted at GET /api/threads. Three sources of truth:
 *
 *   1. ~/.claude/sessions/<pid>.json — currently-running Claude Code
 *      processes (pid, sessionId, cwd, status: busy|idle, updatedAt).
 *      Source of truth for "live" sessions.
 *
 *   2. ~/.claude/projects/-home-adrian-projects-adrian-milsap/<sid>.jsonl —
 *      transcript archive. mtime is "last activity" proxy. First record
 *      carries cwd + gitBranch + first user prompt for summary.
 *
 *   3. `git worktree list --porcelain` — every linked checkout. Each
 *      worktree's basename is matched against Hermes task IDs by the
 *      page-side correlator.
 *
 * Always returns 200 with `{ worktrees, liveSessions, recentSessions, now }`
 * so the page can degrade gracefully when sources are missing or empty.
 *
 * @module threads-middleware
 */

import {
  readdirSync,
  readFileSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  existsSync,
} from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

const HOME = os.homedir();
const SESSIONS_DIR = path.join(HOME, '.claude', 'sessions');
// Claude Code encodes project paths by replacing slashes with dashes and
// prefixing the leading slash. We resolve the directory at request time
// using the projectRoot the middleware is configured with.
const RECENT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RECENT_LIMIT = 50;
const HEAD_TAIL_BYTES = 32768; // must clear SessionStart hook output (superpowers skill injects ~8–12 KB)

function projectTranscriptDir(projectRoot) {
  // /home/adrian/projects/adrian-milsap → -home-adrian-projects-adrian-milsap
  const slug = projectRoot.replace(/\//g, '-');
  return path.join(HOME, '.claude', 'projects', slug);
}

function safeReadJSON(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readHeadTail(file, bytes = HEAD_TAIL_BYTES) {
  // Returns up to `bytes` from start and `bytes` from end without slurping
  // multi-MB transcripts into memory.
  let fd;
  try {
    fd = openSync(file, 'r');
    const size = statSync(file).size;
    const headBuf = Buffer.alloc(Math.min(bytes, size));
    readSync(fd, headBuf, 0, headBuf.length, 0);
    let tail = Buffer.alloc(0);
    if (size > headBuf.length) {
      const tailLen = Math.min(bytes, size - headBuf.length);
      tail = Buffer.alloc(tailLen);
      readSync(fd, tail, 0, tailLen, size - tailLen);
    }
    return { head: headBuf.toString('utf8'), tail: tail.toString('utf8'), size };
  } catch {
    return { head: '', tail: '', size: 0 };
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function _firstParseableJSONL(text) {
  // Walk lines until we successfully parse one. Truncated final line OK.
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      return JSON.parse(line);
    } catch {
      /* try next */
    }
  }
  return null;
}

function lastParseableJSONL(text) {
  // Walk lines from the end. The very last line might be truncated mid-write.
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      return JSON.parse(line);
    } catch {
      /* try previous */
    }
  }
  return null;
}

function extractSessionMeta(text) {
  // Scan all parseable lines for cwd/gitBranch (any line) and firstPrompt
  // (first real user message, skipping isMeta tool-result lines). Needed
  // because the SessionStart hook injects a large block before the first
  // user turn, pushing it past a naive 1-line read.
  let cwd = null,
    gitBranch = null,
    firstPrompt = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!cwd && typeof obj.cwd === 'string') cwd = obj.cwd;
    if (!gitBranch && typeof obj.gitBranch === 'string') gitBranch = obj.gitBranch;
    if (!firstPrompt && obj.type === 'user' && !obj.isMeta && obj.message?.role === 'user') {
      const c0 = obj.message.content;
      if (typeof c0 === 'string') firstPrompt = c0.slice(0, 120);
      else if (Array.isArray(c0)) {
        const t = c0.find((b) => b?.type === 'text' && typeof b?.text === 'string');
        if (t) firstPrompt = t.text.slice(0, 120);
      }
    }
    if (cwd && gitBranch && firstPrompt) break;
  }
  return { cwd, gitBranch, firstPrompt };
}

function readLiveSessions({ allowedCwds, scopeAll }) {
  if (!existsSync(SESSIONS_DIR)) return [];
  let entries;
  try {
    entries = readdirSync(SESSIONS_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const data = safeReadJSON(path.join(SESSIONS_DIR, name));
    if (!data || typeof data !== 'object') continue;
    const cwd = typeof data.cwd === 'string' ? data.cwd : null;
    if (!cwd) continue;
    if (!scopeAll && !allowedCwds.some((root) => cwd === root || cwd.startsWith(root + '/')))
      continue;
    out.push({
      pid: typeof data.pid === 'number' ? data.pid : null,
      sessionId: typeof data.sessionId === 'string' ? data.sessionId : null,
      cwd,
      status: data.status === 'busy' ? 'busy' : 'idle',
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
      name: typeof data.name === 'string' ? data.name : null,
      gitBranch: typeof data.gitBranch === 'string' ? data.gitBranch : null,
    });
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

function readRecentSessions({ projectRoot, excludeSessionIds, scopeAll, allowedCwds }) {
  const dir = projectTranscriptDir(projectRoot);
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const cutoff = Date.now() - RECENT_AGE_MS;
  const candidates = [];
  for (const name of entries) {
    if (!name.endsWith('.jsonl')) continue;
    const sessionId = name.replace(/\.jsonl$/, '');
    if (excludeSessionIds.has(sessionId)) continue;
    const file = path.join(dir, name);
    let mtime;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (mtime < cutoff) continue;
    candidates.push({ sessionId, file, mtime });
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  const top = candidates.slice(0, RECENT_LIMIT);

  const out = [];
  for (const c of top) {
    const { head, tail } = readHeadTail(c.file);
    const meta = extractSessionMeta(head);
    const last = lastParseableJSONL(tail) ?? lastParseableJSONL(head);
    const cwd = meta.cwd;
    if (!scopeAll && cwd && !allowedCwds.some((root) => cwd === root || cwd.startsWith(root + '/')))
      continue;
    const lastAt = last?.timestamp ? Date.parse(last.timestamp) : c.mtime;
    out.push({
      sessionId: c.sessionId,
      cwd,
      gitBranch: meta.gitBranch,
      firstPrompt: meta.firstPrompt,
      firstAt: c.mtime,
      lastAt: Number.isFinite(lastAt) ? lastAt : c.mtime,
    });
  }
  return out;
}

async function readWorktrees({ projectRoot }) {
  try {
    const { stdout } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectRoot,
      timeout: 5_000,
    });
    const blocks = stdout.split('\n\n').filter((b) => b.trim());
    const out = [];
    for (const block of blocks) {
      const lines = block.split('\n');
      const get = (prefix) => {
        const line = lines.find((l) => l.startsWith(prefix));
        return line ? line.slice(prefix.length).trim() : null;
      };
      const wtPath = get('worktree ');
      const commit = get('HEAD ');
      const branchRef = get('branch ');
      if (!wtPath) continue;
      const branch = branchRef ? branchRef.replace(/^refs\/heads\//, '') : '(detached)';
      out.push({ path: wtPath, branch, commit: commit ?? '', basename: path.basename(wtPath) });
    }
    return out;
  } catch {
    return [];
  }
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/**
 * Build the connect-style middleware. `projectRoot` is the absolute path
 * of the repo whose threads we surface. Live sessions are filtered to
 * cwds inside the project tree (or its sibling worktrees) unless the
 * client passes `?scope=all`.
 *
 * @param {{ projectRoot: string; siblingRoots?: string[] }} opts
 */
export function createThreadsMiddleware({ projectRoot, siblingRoots = [] }) {
  return async function threads(req, res, next) {
    if (req.method !== 'GET') return next();
    const url = new URL(req.url, 'http://localhost');
    const scopeAll = url.searchParams.get('scope') === 'all';

    let payload;
    try {
      const worktrees = await readWorktrees({ projectRoot });
      const allowedCwds = scopeAll
        ? []
        : [projectRoot, ...siblingRoots, ...worktrees.map((w) => w.path)];
      const liveSessions = readLiveSessions({ allowedCwds, scopeAll });
      const liveSessionIds = new Set(liveSessions.map((s) => s.sessionId).filter(Boolean));
      const recentSessions = readRecentSessions({
        projectRoot,
        excludeSessionIds: liveSessionIds,
        scopeAll,
        allowedCwds,
      });
      payload = { worktrees, liveSessions, recentSessions, now: Date.now() };
    } catch {
      payload = { worktrees: [], liveSessions: [], recentSessions: [], now: Date.now() };
    }
    jsonResponse(res, 200, payload);
  };
}
