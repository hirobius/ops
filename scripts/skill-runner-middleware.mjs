/**
 * scripts/skill-runner-middleware.mjs
 *
 * Dev-only HTTP middleware that runs a whitelisted set of repo scripts
 * in response to POST /api/skills/:id from the /ops dashboard.
 *
 * Per `13w-ops-skill-runner` in the hardening roadmap: the dashboard
 * needs to be able to invoke the same commands Adrian types into a
 * terminal (closure:plan, strength, audit-claims, …) without exposing
 * an unbounded shell.
 *
 * Whitelist is exhaustive — anything not in the table returns 403.
 * Commands are hard-coded with arrays (no shell interpolation).
 *
 * Argv-template substitution (Refs: t_554cd532 / dashbd-skillsbar-input-shell):
 * a spec whose `argv` contains the literal `${input}` is wired to the
 * SkillTile input-shell. The dashboard POSTs `{ input: <string> }` as
 * application/json; every `${input}` argv element is replaced with that
 * raw string before spawn. No shell, still array argv.
 *
 * @module skill-runner-middleware
 */

import { spawn as nodeSpawn } from 'node:child_process';

/** @typedef {{ argv: string[]; timeoutMs: number; supportsJson?: boolean }} SkillSpec */

/** Max bytes the JSON request body may carry. Anything larger → 413. */
export const BODY_BYTE_CAP = 8 * 1024;

/** The argv placeholder substituted from the request body's `input` field. */
const INPUT_PLACEHOLDER = '${input}';

/** @type {Record<string, SkillSpec>} */
const SKILLS = {
  'closure-plan': { argv: ['pnpm', 'closure:plan'], timeoutMs: 60_000 },
  strength: { argv: ['pnpm', 'strength'], timeoutMs: 30_000 },
  'firing-stats': { argv: ['pnpm', 'guardrail:firing-stats'], timeoutMs: 30_000 },
  'audit-claims': {
    argv: ['node', 'scripts/audit-claims.mjs', '--json'],
    timeoutMs: 15_000,
    supportsJson: true,
  },
  'verify-head': {
    argv: [
      'node',
      'scripts/run-gates.mjs',
      '--channel',
      'pre-commit',
      '--emit-jsonl',
      'docs/guardrails/firing-log.jsonl',
    ],
    timeoutMs: 90_000,
  },
  'snapshot-orch': { argv: ['node', 'scripts/snapshot-orchestration.mjs'], timeoutMs: 5_000 },
  'list-eligible': {
    argv: ['node', 'scripts/list-eligible.mjs', '--json'],
    timeoutMs: 5_000,
    supportsJson: true,
  },
  'triage-approved': {
    argv: ['node', 'scripts/triage-approved.mjs', '--json'],
    timeoutMs: 10_000,
    supportsJson: true,
  },
  'audit-sidecar': { argv: ['pnpm', 'audit:sidecar'], timeoutMs: 30_000 },
  // Build (creator-facing artefact regen)
  'tokens-index': { argv: ['node', 'scripts/build-token-index.mjs'], timeoutMs: 30_000 },
  'llms-generate': { argv: ['node', 'scripts/generate-llms-txt.mjs'], timeoutMs: 30_000 },
  'figma-audit': { argv: ['node', 'scripts/audit-figma-system.mjs'], timeoutMs: 20_000 },
  'figma-vars': { argv: ['node', 'scripts/build-figma-variables.mjs'], timeoutMs: 30_000 },
  'convert-assets': { argv: ['node', 'scripts/convert-incoming-assets.mjs'], timeoutMs: 90_000 },
  // Ops (repo health)
  'record-health': { argv: ['node', 'scripts/record-health.mjs'], timeoutMs: 10_000 },
  changelog: { argv: ['node', 'scripts/generate-changelog.mjs'], timeoutMs: 30_000 },
  // Sales
  'sales-pipeline': {
    argv: ['node', 'scripts/sales-pipeline.mjs', '--json'],
    timeoutMs: 5_000,
    supportsJson: true,
  },
  'sales-proposal': {
    argv: ['node', 'scripts/sales-proposal.mjs', '${input}'],
    timeoutMs: 5_000,
  },
  // Client — meeting → tasks, weekly digest
  'meeting-to-tasks': {
    argv: ['node', 'scripts/meeting-to-tasks.mjs', '${input}'],
    timeoutMs: 10_000,
  },
  'client-digest': {
    argv: ['node', 'scripts/client-digest.mjs', '${input}'],
    timeoutMs: 10_000,
  },
  // Self — recruiter-facing artefacts + founder hygiene
  'activity-log': {
    argv: ['node', 'scripts/activity-log.mjs'],
    timeoutMs: 10_000,
  },
  'case-study-draft': {
    argv: ['node', 'scripts/case-study-draft.mjs', '${input}'],
    timeoutMs: 10_000,
  },
  // Build — AI-powered build skills
  'promote-to-core': {
    argv: ['node', 'scripts/promote-to-core.mjs', '${input}'],
    timeoutMs: 10_000,
  },
  // Knowledge
  'parse-bookmarks': { argv: ['node', 'scripts/parse-bookmarks.mjs'], timeoutMs: 30_000 },
  'research-list': {
    argv: ['node', 'scripts/auto-research.mjs', '--list', '--json'],
    timeoutMs: 5_000,
    supportsJson: true,
  },
  'research-run': {
    argv: ['node', 'scripts/auto-research.mjs', '--once', '--json'],
    timeoutMs: 300_000,
    supportsJson: true,
  },
};

/** Skill IDs the client may run. Exported so the page can render the list. */
export const SKILL_IDS = Object.freeze(Object.keys(SKILLS));

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Pure helper: resolve a spec's argv given an optional input string.
 *
 * - If the spec has no `${input}` placeholder, returns the original argv
 *   regardless of the provided input (back-compat with non-input skills).
 * - If the spec has placeholders and `input` is a non-empty string, returns
 *   argv with every `${input}` substituted.
 * - Otherwise returns an `{ error }` envelope the caller can forward as a 400.
 *
 * @param {SkillSpec} spec
 * @param {string | undefined} input
 * @returns {{ argv?: string[]; error?: { status: number; body: object } }}
 */
export function resolveArgv(spec, input) {
  const needsInput = spec.argv.some((a) => a.includes(INPUT_PLACEHOLDER));
  if (!needsInput) return { argv: spec.argv };
  if (typeof input !== 'string' || input.length === 0) {
    return { error: { status: 400, body: { ok: false, error: 'input required' } } };
  }
  return { argv: spec.argv.map((a) => a.split(INPUT_PLACEHOLDER).join(input)) };
}

/**
 * Read at most `BODY_BYTE_CAP` bytes from `req` and parse as JSON. Returns:
 * - `{ input: string }` when body parsed cleanly and contained `input`.
 * - `{ input: undefined }` when body was empty or had no `input` field.
 * - `{ error }` envelope on oversized / malformed body.
 *
 * @param {NodeJS.ReadableStream} req
 * @param {number} [cap=BODY_BYTE_CAP]
 */
export function parseInputBody(req, cap = BODY_BYTE_CAP) {
  return new Promise((resolve) => {
    let received = 0;
    let aborted = false;
    /** @type {Buffer[]} */
    const chunks = [];

    req.on('data', (chunk) => {
      if (aborted) return;
      received += chunk.length;
      if (received > cap) {
        aborted = true;
        resolve({ error: { status: 413, body: { ok: false, error: 'body too large' } } });
        // Drain remaining data so the socket doesn't stall.
        req.resume?.();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (aborted) return;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.length === 0) {
        resolve({ input: undefined });
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        resolve({ error: { status: 400, body: { ok: false, error: 'invalid JSON body' } } });
        return;
      }
      const input =
        parsed && typeof parsed === 'object' && typeof parsed.input === 'string'
          ? parsed.input
          : undefined;
      resolve({ input });
    });

    req.on('error', () => {
      if (aborted) return;
      aborted = true;
      resolve({ error: { status: 400, body: { ok: false, error: 'request error' } } });
    });
  });
}

/**
 * Build a connect-style middleware that handles `POST /api/skills/:id`.
 *
 * @param {{
 *   cwd: string,
 *   spawn?: typeof nodeSpawn,
 *   extraSkills?: Record<string, SkillSpec>,
 * }} opts
 *  - `spawn` overrides the spawner (tests inject a stub).
 *  - `extraSkills` is merged onto the whitelist (tests register fixtures).
 */
export function createSkillRunnerMiddleware({ cwd, spawn = nodeSpawn, extraSkills } = {}) {
  const registry = extraSkills ? { ...SKILLS, ...extraSkills } : SKILLS;

  return async function skillRunner(req, res, next) {
    if (req.method !== 'POST') return next();
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/([^/]+)$/);
    if (!match) return next();
    const skillId = match[1];
    const spec = registry[skillId];
    if (!spec) {
      return jsonResponse(res, 403, { ok: false, error: `unknown skill id: ${skillId}` });
    }

    const bodyResult = await parseInputBody(req);
    if (bodyResult.error) {
      return jsonResponse(res, bodyResult.error.status, bodyResult.error.body);
    }

    const argvResult = resolveArgv(spec, bodyResult.input);
    if (argvResult.error) {
      return jsonResponse(res, argvResult.error.status, argvResult.error.body);
    }

    const start = Date.now();
    const [cmd, ...args] = argvResult.argv;
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const proc = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2_000);
    }, spec.timeoutMs);

    proc.stdout.on('data', (c) => {
      stdout += c.toString();
    });
    proc.stderr.on('data', (c) => {
      stderr += c.toString();
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      jsonResponse(res, 500, { ok: false, error: String(error?.message || error) });
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      let parsedOutput = null;
      if (spec.supportsJson) {
        try {
          parsedOutput = JSON.parse(stdout);
        } catch {
          parsedOutput = null;
        }
      }
      jsonResponse(res, 200, {
        ok: !timedOut && code === 0,
        timedOut,
        exitCode: code,
        durationMs,
        stdout: stdout.slice(-4_000),
        stderr: stderr.slice(-2_000),
        parsedOutput,
      });
    });
  };
}
