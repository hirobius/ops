/**
 * scripts/service-manager-middleware.mjs
 * Dev-only Connect middleware for /api/services/*.
 * Mounted at /api/services in vite.config.mjs; req.url is the suffix.
 *
 * Routes:
 *   GET  /status            → { [name]: "running"|"stopped" }
 *   POST /:name/start       → spawn child process, store in map
 *   POST /:name/stop        → SIGTERM child, remove from map
 *
 * Env-var note: hds-bridge and discord-bot are spawned with
 * --env-file=.env.local (requires Node ≥20.6). The process exits
 * immediately if the file is absent or tokens are missing; the next
 * status poll reflects the stopped state automatically.
 */

import { spawn, execFileSync } from 'node:child_process';

const SERVICES = {
  'hds-bridge': {
    label:     'HDS Bridge',
    args:      ['--env-file=.env.local', 'scripts/hds-bridge.mjs'],
    psPattern: 'scripts/hds-bridge.mjs',
  },
  'discord-bot': {
    label:     'Discord Bot',
    args:      ['--env-file=.env.local', 'scripts/discord-bot.mjs'],
    psPattern: 'scripts/discord-bot.mjs',
  },
};

/** @type {Map<string, import('node:child_process').ChildProcess>} */
const running = new Map();

/** @type {Map<string, { startedAt: string }>} */
const runningMeta = new Map();

/**
 * Returns { pid, startedAt } for a process matching psPattern via pgrep, or null.
 * Handles processes started outside the service manager.
 */
function findProcess(psPattern) {
  try {
    const pgrepOut = execFileSync('pgrep', ['-f', psPattern], { encoding: 'utf8' }).trim();
    const pid = parseInt(pgrepOut.split('\n')[0], 10);
    if (!pid) return null;
    const etimesOut = execFileSync(
      'ps', ['-p', String(pid), '-o', 'etimes='],
      { encoding: 'utf8' },
    ).trim();
    const elapsedSeconds = parseInt(etimesOut, 10);
    const startedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();
    return { pid, startedAt };
  } catch {
    return null;
  }
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * @param {{ cwd: string }} options
 * @returns {import('connect').HandleFunction}
 */
export function createServiceManagerMiddleware({ cwd }) {
  return function serviceManagerMiddleware(req, res, next) {
    const url  = new URL(req.url, 'http://localhost');
    const path = url.pathname; // e.g. '/status', '/hds-bridge/start'

    // GET /status
    if (req.method === 'GET' && path === '/status') {
      const status = {};
      for (const [name, svc] of Object.entries(SERVICES)) {
        const proc = running.get(name);
        if (proc) {
          const meta = runningMeta.get(name);
          status[name] = { status: 'running', pid: proc.pid, startedAt: meta?.startedAt ?? null };
        } else {
          const found = findProcess(svc.psPattern);
          status[name] = found
            ? { status: 'running', pid: found.pid, startedAt: found.startedAt }
            : { status: 'stopped' };
        }
      }
      json(res, 200, status);
      return;
    }

    // POST /:name/start | /:name/stop
    if (req.method === 'POST') {
      const match = path.match(/^\/([^/]+)\/(start|stop)$/);
      if (!match) return next();
      const [, name, action] = match;

      if (!SERVICES[name]) {
        json(res, 400, { error: `Unknown service: ${name}` });
        return;
      }

      if (action === 'start') {
        if (running.has(name)) {
          json(res, 200, { status: 'running', note: 'already running' });
          return;
        }
        const svc  = SERVICES[name];
        const proc = spawn('node', svc.args, { cwd, stdio: 'pipe' });
        running.set(name, proc);
        runningMeta.set(name, { startedAt: new Date().toISOString() });
        proc.on('close', () => { running.delete(name); runningMeta.delete(name); });
        proc.on('error', () => { running.delete(name); runningMeta.delete(name); });
        json(res, 200, { status: 'started' });
        return;
      }

      if (action === 'stop') {
        const proc = running.get(name);
        if (!proc) {
          json(res, 200, { status: 'stopped', note: 'not running' });
          return;
        }
        proc.kill('SIGTERM');
        running.delete(name);
        json(res, 200, { status: 'stopped' });
        return;
      }
    }

    next();
  };
}
