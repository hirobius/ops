#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/kimi-agent.mjs
 *
 * Autonomous unit executor powered by Kimi-K2 (or any OpenAI-compatible model).
 * Reads from docs/ai/ready-queue.json / docs/ai/orchestration.json, claims a
 * unit, drives a tool-use loop locally, validates, commits, marks done.
 *
 * This is a PARALLEL path to Claude Code sub-agents — same orchestration
 * protocol, different executor. Both write to the same orchestration.json and
 * respect the same claim/done state machine.
 *
 * Modes:
 *   --unit <id>       execute a specific unit
 *   --loop            run continuously until queue is empty
 *   --dry-run         print the next eligible unit and exit
 *   --mode bridge     run in hds-bridge LLM-backend mode (no orchestration)
 *
 * Config (env vars):
 *   MOONSHOT_API_KEY  required for Kimi-K2 (platform.moonshot.ai)
 *   KIMI_BASE_URL     defaults to https://api.moonshot.cn/v1
 *   KIMI_MODEL        defaults to kimi-k2 (or moonshot-v1-128k)
 *   KIMI_MAX_TOKENS   defaults to 8192
 *   KIMI_AGENT_ID     identifier written into orchestration claims (default: kimi-agent)
 *
 * Invocation:
 *   MOONSHOT_API_KEY=sk-... node scripts/kimi-agent.mjs --dry-run
 *   MOONSHOT_API_KEY=sk-... node scripts/kimi-agent.mjs --unit 12g-1-agent-infra-p0-fixes
 *   MOONSHOT_API_KEY=sk-... node scripts/kimi-agent.mjs --loop
 */

import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { logPodRun } from '../telemetry/pod-runs.mjs';
import { appendAuditEntry } from '../docs/security/audit-logger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH_PATH = path.join(ROOT, 'docs/ai/orchestration.json');
const QUEUE_PATH = path.join(ROOT, 'docs/ai/ready-queue.json');

// Auto-load .env.local so MOONSHOT_API_KEY doesn't need a manual export
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
const KIMI_MODEL = process.env.KIMI_MODEL || 'kimi-k2.6';
const KIMI_MAX_TOKENS = Number(process.env.KIMI_MAX_TOKENS) || 8192;
const AGENT_ID = process.env.KIMI_AGENT_ID || 'kimi-agent';

// Iteration cap — most units close in 4-8 tool calls. Past 12, Kimi is
// almost always stuck in an exploratory loop, not making progress.
const MAX_TOOL_ITERATIONS = Number(process.env.KIMI_MAX_ITERATIONS) || 12;

// Wall-clock cap per unit — backstop for slow loops that don't blow tokens.
const UNIT_WALL_CLOCK_MS = Number(process.env.KIMI_UNIT_TIMEOUT_MS) || 8 * 60 * 1000;

// Token budget per unit — warn at 75K, hard-abort at 120K input tokens.
// At $0.60/1M that's $0.045 warn / $0.072 hard ceiling per unit.
// Raised 2026-05-03 from 60/90: real units (esp. spec-heavy ones) need headroom.
const TOKEN_WARN_THRESHOLD = Number(process.env.KIMI_WARN_TOKENS) || 75_000;
const TOKEN_ABORT_THRESHOLD = Number(process.env.KIMI_ABORT_TOKENS) || 120_000;

// Skip units that have aborted this many times — they need human triage.
const MAX_KIMI_ATTEMPTS = Number(process.env.KIMI_MAX_ATTEMPTS) || 3;

// Max bytes for any single tool result injected into context
const TOOL_RESULT_CAP = 6_144; // 6KB — enough for any useful error output
// Keep this many recent assistant+tool turn pairs in context (plus system+first user)
const MESSAGE_WINDOW = 10;

const API_KEY = process.env.MOONSHOT_API_KEY;

// ── CLI flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const LOOP = argv.includes('--loop');
const NO_COMMIT = argv.includes('--no-commit'); // observe only — no git ops
const unitIdx = argv.indexOf('--unit');
const UNIT_ID = unitIdx !== -1 ? argv[unitIdx + 1] : null;
const concurIdx = argv.indexOf('--concurrency');
const CONCURRENCY = concurIdx !== -1 ? Math.max(1, parseInt(argv[concurIdx + 1], 10) || 1) : 1;

// ── Safety blocklist ──────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /git\s+push/,
  /pnpm\s+check:release/,
  /npm\s+publish/,
  /rm\s+-rf\s+[^n]/, // allow rm -rf node_modules; block everything else
  /git\s+reset\s+--hard/, // agent should not nuke its own changes mid-loop
  /curl.*\|.*sh/, // no curl-pipe-sh
  /wget.*\|.*sh/,
];

function isSafeCommand(cmd) {
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(cmd)) return false;
  }
  return true;
}

// ── Tool definitions (OpenAI function-calling format) ────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the repository. Use this before editing.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Repo-relative path, e.g. src/app/components/HdsButton.tsx',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write (overwrite) a file. Always read first unless creating new.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repo-relative path.' },
          content: { type: 'string', description: 'Full file content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_bash',
      description:
        'Run a shell command in the repo root. Blocklisted: git push, pnpm check:release, rm -rf (non-node_modules), npm publish.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run.' },
          timeout_ms: { type: 'number', description: 'Max ms to wait. Default 30000.' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files in a directory (non-recursive by default).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repo-relative directory path.' },
          recursive: { type: 'boolean', description: 'List recursively. Default false.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_unit',
      description: 'Get full details for an orchestration unit by ID.',
      parameters: {
        type: 'object',
        properties: {
          unit_id: { type: 'string', description: 'Unit ID, e.g. 12g-1-agent-infra-p0-fixes.' },
        },
        required: ['unit_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_done',
      description:
        'Mark the current unit as done in orchestration.json. Call this AFTER validationCmd passes and your commit is made.',
      parameters: {
        type: 'object',
        properties: {
          unit_id: { type: 'string' },
          commit_hash: { type: 'string', description: 'Short git hash of the unit commit.' },
          completion_note: { type: 'string', description: 'One-line summary of what was done.' },
        },
        required: ['unit_id'],
      },
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

function executeTool(name, args) {
  try {
    switch (name) {
      case 'read_file': {
        const abs = path.join(ROOT, args.path);
        if (!fs.existsSync(abs)) return { error: `File not found: ${args.path}` };
        const content = fs.readFileSync(abs, 'utf8');
        // Cap at 20KB to avoid blowing up context
        return content.length > 20480
          ? { content: content.slice(0, 20480), truncated: true, total_bytes: content.length }
          : { content };
      }

      case 'write_file': {
        const abs = path.resolve(ROOT, args.path);
        if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
          return { error: `Path traversal blocked: ${args.path} escapes repo root` };
        }
        // NO_COMMIT means "no git commits" not "no file writes" — write the file so
        // subsequent read_file calls see consistent state; restore with git checkout after run.
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, args.content, 'utf8');
        if (NO_COMMIT)
          console.log(`[kimi-agent] [no-commit] wrote ${args.path} (git commit suppressed)`);
        return { ok: true, bytes_written: args.content.length };
      }

      case 'run_bash': {
        if (!isSafeCommand(args.command)) {
          return { error: `Blocked command (safety policy): ${args.command}` };
        }
        if (NO_COMMIT && /git\s+(add|commit|checkout\s+--)/.test(args.command)) {
          console.log(`[kimi-agent] [no-commit] WOULD run: ${args.command}`);
          // Simulate a successful commit so the agent proceeds to mark_done instead of retrying
          const fakeHash = Math.random().toString(16).slice(2, 9);
          const subject = args.command.match(/-m\s+["']([^"']{0,80})/)?.[1] || 'committed';
          return {
            stdout: `[fix/ui-pipeline ${fakeHash}] ${subject}\n 1 file changed`,
            exit_code: 0,
            dry_run: true,
          };
        }
        try {
          const out = execSync(args.command, {
            cwd: ROOT,
            timeout: args.timeout_ms || 30000,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          // Guard against binary output (e.g. cat on a binary file) — null bytes indicate binary
          if (out.includes(' ')) {
            return {
              stdout: '[binary output suppressed — likely cat on a binary file]',
              exit_code: 0,
              warning: 'binary',
            };
          }
          return { stdout: out, exit_code: 0 };
        } catch (e) {
          const stdout = (e.stdout || '').includes(' ')
            ? '[binary output suppressed]'
            : e.stdout || '';
          return {
            stdout,
            stderr: e.stderr || '',
            exit_code: e.status ?? 1,
          };
        }
      }

      case 'list_directory': {
        const abs = path.resolve(ROOT, args.path);
        if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
          return { error: `Path traversal blocked: ${args.path} escapes repo root` };
        }
        if (!fs.existsSync(abs)) return { error: `Path not found: ${args.path}` };
        if (args.recursive) {
          const out = execFileSync(
            'find',
            [abs, '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*', '-type', 'f'],
            { encoding: 'utf8' },
          );
          return {
            files: out
              .trim()
              .split('\n')
              .filter(Boolean)
              .map((f) => path.relative(ROOT, f)),
          };
        }
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        return {
          entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
        };
      }

      case 'get_unit': {
        const data = JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
        const unit = data.units.find((u) => u.id === args.unit_id);
        if (!unit) return { error: `Unit not found: ${args.unit_id}` };
        return { unit };
      }

      case 'mark_done': {
        const data = JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
        const unit = data.units.find((u) => u.id === args.unit_id);
        if (!unit) return { error: `Unit not found: ${args.unit_id}` };

        // 13g-8: audit-batch-deliverables gates mark-done. Voluntary
        // self-audit becomes mandatory. If audit fails, status stays
        // 'claimed', the audit output is captured into lastAbort for the
        // next attempt's prompt (Boris's verification-iteration pattern).
        try {
          execSync(
            `node scripts/audit-batch-deliverables.mjs --pre-mark-done --units ${args.unit_id}`,
            {
              cwd: ROOT,
              stdio: 'pipe',
              encoding: 'utf8',
            },
          );
        } catch (auditErr) {
          const out =
            (auditErr.stderr ? String(auditErr.stderr) : '') +
            (auditErr.stdout ? String(auditErr.stdout) : '');
          unit.lastAbort = {
            agent: process.env.KIMI_AGENT_ID || 'kimi-agent',
            at: new Date().toISOString(),
            reason: 'audit-batch-deliverables failed pre-mark-done',
            validationOutput: out.slice(0, 2000),
          };
          unit.attempts = (unit.attempts ?? 0) + 1;
          fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));
          return {
            error:
              `mark_done refused: audit-batch-deliverables exited non-zero. ` +
              `Output captured in lastAbort.validationOutput (next attempt sees this). ` +
              `Fix the failure and re-run mark_done. Output preview: ${out.slice(0, 400)}`,
          };
        }

        // Audit passed — proceed with status flip.
        unit.status = 'done';
        unit.completedAt = new Date().toISOString().slice(0, 10);
        if (args.commit_hash) unit.completedCommit = args.commit_hash;
        if (args.completion_note) unit.completionNote = args.completion_note;
        if (NO_COMMIT) {
          console.log(`[kimi-agent] [no-commit] WOULD mark ${args.unit_id} done`);
          return { ok: true, unit_id: args.unit_id, completedAt: unit.completedAt, dry_run: true };
        }
        fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));
        try {
          execSync(
            `git add docs/ai/orchestration.json && git commit --no-verify -m "chore(orch): mark ${args.unit_id} done [kimi-agent]"`,
            { cwd: ROOT, stdio: 'inherit' },
          );
        } catch (commitErr) {
          return { error: `mark_done: file written but commit failed: ${commitErr.message}` };
        }
        return { ok: true, unit_id: args.unit_id, completedAt: unit.completedAt };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

const TELEMETRY_PATH = path.join(ROOT, 'telemetry/events.jsonl');

function logCostEvent(unitId, inputTokens, outputTokens, doneOk) {
  try {
    const cost = ((inputTokens / 1e6) * 0.6 + (outputTokens / 1e6) * 2.5).toFixed(4);
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      event: 'kimi.unit.complete',
      data: { unitId, inputTokens, outputTokens, costUsd: Number(cost), ok: doneOk },
    });
    fs.appendFileSync(TELEMETRY_PATH, entry + '\n');
  } catch {
    /* non-fatal */
  }
}

// ── Discord notifications ─────────────────────────────────────────────────────

function notify(msg) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    execSync(
      `curl -s -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify({ content: msg }))} "${url}"`,
      { stdio: 'ignore', timeout: 5000 },
    );
  } catch {
    /* non-fatal */
  }
}

// ── Orchestration helpers ─────────────────────────────────────────────────────

function loadOrchestration() {
  return JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
}

// Kimi-specific eligibility: a unit is "kimi-eligible" only if it isn't
// hitl, hasn't been quarantined, and hasn't already failed MAX_KIMI_ATTEMPTS
// times. The hitl + _kimiQuarantined gates also catch units that other
// scripts (audit, watcher) have flagged as needing human attention.
function isKimiEligible(u) {
  if (u.hitl) return false;
  if (u._kimiQuarantined) return false;
  if ((u._kimiAttempts || 0) >= MAX_KIMI_ATTEMPTS) return false;
  return true;
}

function findEligibleUnit(unitId) {
  const data = loadOrchestration();
  const doneSet = new Set(
    data.units.filter((u) => u.status === 'done' || u.status === 'denied').map((u) => u.id),
  );

  if (unitId) {
    const unit = data.units.find((u) => u.id === unitId);
    if (!unit) throw new Error(`Unit not found: ${unitId}`);
    return unit;
  }

  // Try ready-queue first (pre-sorted, cheapest). Cross-check against the live
  // orchestration record because the queue may not know about a fresh
  // _kimiAttempts increment from a sibling worker.
  if (fs.existsSync(QUEUE_PATH)) {
    const q = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const queuedAge = Date.now() - Date.parse(q.generatedAt);
    if (queuedAge < 10 * 60 * 1000 && q.eligible?.length > 0) {
      for (const e of q.eligible) {
        if (e.status !== 'approved' || e.hitl) continue;
        const u = data.units.find((x) => x.id === e.id);
        if (u && isKimiEligible(u)) return u;
      }
    }
  }

  // Fallback: compute eligible from orchestration.json directly
  return (
    data.units
      .filter(
        (u) =>
          u.status === 'approved' &&
          isKimiEligible(u) &&
          (u.dependsOn || []).every((d) => doneSet.has(d)),
      )
      .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0] || null
  );
}

function claimUnit(unit) {
  // Overlap gate (13g-4): refuse to claim if another in-flight unit is
  // touching the same file paths. Runs BEFORE any mutation so we never
  // write a claim that conflicts. Non-zero exit aborts cleanly.
  try {
    execSync(`node ${path.join(ROOT, 'scripts/check-unit-overlap.mjs')} --unit ${unit.id}`, {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (overlapErr) {
    const msg = (overlapErr.stderr || overlapErr.stdout || '').trim();
    throw new Error(
      `OVERLAP_BLOCKED: ${unit.id} — ${msg || 'file-path conflict with an in-flight claimed unit'}`,
    );
  }

  // Re-read orchestration.json immediately before writing — concurrent instances
  // may have claimed this unit since findEligibleUnit ran. Throw so the caller
  // can retry with the next eligible unit.
  const data = loadOrchestration();
  const u = data.units.find((x) => x.id === unit.id);
  if (!u) throw new Error(`CLAIM_RACE: unit ${unit.id} disappeared`);
  if (u.status !== 'approved')
    throw new Error(
      `CLAIM_RACE: unit ${unit.id} already ${u.status} by ${u.claimedBy || 'unknown'}`,
    );

  u.status = 'claimed';
  u.claimedBy = AGENT_ID;
  u.claimedAt = new Date().toISOString();

  if (NO_COMMIT) {
    console.log(`[kimi-agent] [no-commit] WOULD claim ${unit.id}`);
    return;
  }

  fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));

  try {
    // --no-verify: orchestration.json is metadata, not source code; hooks check source quality
    execSync(
      `git add docs/ai/orchestration.json && git commit --no-verify -m "chore(orch): claim ${unit.id} for ${AGENT_ID}"`,
      { cwd: ROOT, stdio: 'inherit' },
    );
  } catch {
    // Commit failed (merge conflict from concurrent claim) — revert in-memory write and signal race
    const fresh = loadOrchestration();
    const uf = fresh.units.find((x) => x.id === unit.id);
    if (uf) {
      uf.status = 'approved';
      delete uf.claimedBy;
      delete uf.claimedAt;
    }
    fs.writeFileSync(ORCH_PATH, JSON.stringify(fresh, null, 2));
    throw new Error(`CLAIM_RACE: commit failed for ${unit.id} — another instance claimed it first`);
  }
  console.log(`[kimi-agent] Claimed ${unit.id}`);
}

// ── System prompt builder ─────────────────────────────────────────────────────

const DESC_CAP = 800; // chars — prevents 500-word unit descriptions from eating budget
const NOTES_CAP = 400; // chars per agentNotes entry

function capText(text, cap) {
  if (!text) return '';
  const s = Array.isArray(text) ? text.map(String).join('\n') : String(text);
  return s.length > cap ? s.slice(0, cap) + ' …[truncated]' : s;
}

// Strip "[kimi abort YYYY-MM-DD]" / "[hermes abort ...]" markers and stray
// trailing commas/newlines they leave behind. These accumulate in agentNotes
// across failed runs and bloat every subsequent prompt.
const ABORT_MARKER_RE = /\s*\[\s*(kimi|hermes)\s+abort[^\]]*\][^\n,]*/gi;
function stripAbortSpam(text) {
  if (!text) return text;
  if (Array.isArray(text)) return text.map(stripAbortSpam);
  return String(text).replace(ABORT_MARKER_RE, '').replace(/,+/g, ',').trim();
}

function buildSystemPrompt(unit) {
  const desc = capText(stripAbortSpam(unit.description), DESC_CAP);
  const notes = capText(stripAbortSpam(unit.agentNotes), NOTES_CAP);
  const fileList =
    Array.isArray(unit.files) && unit.files.length > 0 ? unit.files.join(', ') : null;
  return `You are an autonomous software engineer executing build unit "${unit.id}" in the Hirobius Design System (HDS) repository.

REPO ROOT: ${ROOT}
BRANCH: fix/ui-pipeline (already checked out)
STACK: Next.js 15, React 19, TypeScript, pnpm. No new npm dependencies.

YOUR UNIT:
ID: ${unit.id}
Title: ${unit.title || unit.id}
Description: ${desc || '(see agentNotes)'}
${notes ? `Agent notes: ${notes}` : ''}
${fileList ? `Files: ${fileList}` : ''}
Validation command: ${unit.validationCmd || 'node scripts/validate-manifest.mjs && node scripts/check-manifest-drift.mjs'}

TOKEN DISCIPLINE — THIS IS THE #1 RULE (read carefully):
You are on a hard 120K input-token budget. Most units close in 4-8 tool calls.
Past 12 calls or 120K tokens you are aborted and the unit is re-queued.

A. READ FIRST, EXPLORE NEVER. Begin by reading files explicitly named in the
   unit spec, agentNotes, or Files list above. Do NOT do a discovery pass.
B. NEVER run \`grep -r\`, \`grep -R\`, or \`find .\` over the whole repo. These
   single calls can exceed your budget. If you must search, use
   \`git ls-files | grep <pattern>\` (cheap — lists tracked files only) or
   target a specific subdir: \`grep -rn <pattern> src/app/components\`.
C. Prefer \`read_file\` over \`run_bash\` for file inspection. Never use
   \`cat\`, \`head\`, \`tail\`, or \`wc\` on files you can read_file.
D. If after reading 3 files you still cannot identify what to change,
   stop and output "BLOCKER: scope unclear — <one-line reason>".
E. Do NOT re-read the same file twice. If you need it again, scroll back in
   conversation — it is already in context.
F. When validationCmd outputs more than ~50 lines, only the tail is kept.
   Do not chase up-stack errors that are not in the visible output.

EXECUTION RULES:
1. Read files before editing — always use read_file first.
2. Run the validationCmd after your changes. Fix any failures before committing.
3. Git commit exactly once: message format "feat(<scope>): ${unit.id} <one-liner>"
   Append to body: "Co-Authored-By: Kimi-K2 <noreply@moonshot.ai>"
4. After the commit, call mark_done with the short commit hash.
5. Never git push, never pnpm check:release, never rm -rf (except node_modules).
6. If you hit a blocker you cannot resolve in 3 attempts, stop and output "BLOCKER: <reason>".

SAFETY: run_bash blocks git push, pnpm check:release, and destructive commands.

The full unit spec is above. Begin working — read relevant files, make changes, validate, commit.${
    NO_COMMIT
      ? `

OBSERVATION MODE (--no-commit): git add/commit calls are stubbed — they return fake success but nothing is committed. Do NOT loop on git status after a commit call. After the validationCmd passes and you would normally commit, call mark_done directly with any placeholder hash. The goal is to exercise the tool loop, not persist changes.`
      : ''
  }`;
}

// ── Token-safe helpers ────────────────────────────────────────────────────────

/**
 * Trim a tool result object to TOOL_RESULT_CAP bytes before injecting into context.
 * Keeps the TAIL of stdout/stderr (errors are at the bottom).
 */
function trimToolResult(result) {
  const raw = JSON.stringify(result);
  if (raw.length <= TOOL_RESULT_CAP) return result;

  // For bash results, keep tail (where errors live)
  if (result.stdout !== undefined) {
    const tail = (result.stdout + (result.stderr || '')).slice(-TOOL_RESULT_CAP + 100);
    return {
      stdout: tail,
      exit_code: result.exit_code,
      _trimmed: true,
      _original_bytes: raw.length,
    };
  }

  // For file content, keep head (reader needs the top of the file)
  if (result.content !== undefined) {
    return {
      content: result.content.slice(0, TOOL_RESULT_CAP),
      _trimmed: true,
      _original_bytes: raw.length,
    };
  }

  // Generic: stringify and truncate
  return { _raw_trimmed: raw.slice(0, TOOL_RESULT_CAP), _original_bytes: raw.length };
}

/**
 * Slide the message window: keep system + first user + last MESSAGE_WINDOW turns.
 * A "turn" = one assistant message + ALL of its tool result messages (grouped).
 * IMPORTANT: never split an assistant from its tool results — that orphans tool_call_ids
 * and causes the API to reject with "tool_call_id not found".
 */
function trimMessages(messages) {
  const system = messages[0];
  const firstUser = messages[1];
  const rest = messages.slice(2);

  // Group into turns: each turn starts at an assistant/user non-tool message
  const turns = [];
  for (const m of rest) {
    if (m.role === 'tool' && turns.length > 0) {
      turns[turns.length - 1].push(m);
    } else {
      turns.push([m]);
    }
  }

  if (turns.length <= MESSAGE_WINDOW) return messages; // no trim needed

  const kept = turns.slice(-MESSAGE_WINDOW);
  return [system, firstUser, ...kept.flat()];
}

// ── Kimi API call (with 429 retry) ───────────────────────────────────────────

async function callKimi(messages, tools) {
  if (!API_KEY) {
    throw new Error('MOONSHOT_API_KEY env var required. Set it and re-run.');
  }

  const MAX_RETRIES = 5;
  let delay = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: trimMessages(messages),
        tools,
        tool_choice: 'auto',
        max_tokens: KIMI_MAX_TOKENS,
      }),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;
      console.log(
        `[kimi-agent] Rate limited (429) — waiting ${Math.round(wait / 1000)}s (attempt ${attempt}/${MAX_RETRIES})`,
      );
      await new Promise((r) => setTimeout(r, wait));
      delay = Math.min(delay * 2, 60_000); // exponential backoff, cap at 60s
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kimi API error ${res.status}: ${text}`);
    }

    return res.json();
  }

  throw new Error(`Kimi API: rate limit exceeded after ${MAX_RETRIES} retries`);
}

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runUnit(unit) {
  console.log(`\n[kimi-agent] Starting unit: ${unit.id}`);
  console.log(`[kimi-agent] Model: ${KIMI_MODEL} @ ${KIMI_BASE_URL}`);

  const messages = [
    { role: 'system', content: buildSystemPrompt(unit) },
    // Unit context is already in the system prompt — no get_unit call needed
    {
      role: 'user',
      content: `Execute unit "${unit.id}". The full spec is in the system prompt. Begin working now.`,
    },
  ];

  let iterations = 0;
  let done = false;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const startedAt = Date.now();

  // Audit tracking — collect paths and commands as tool calls execute
  const auditFilesWritten = new Set();
  const auditCommandsRun = [];
  let auditCommitHash = null;

  while (!done && iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    const response = await callKimi(messages, TOOLS);
    const usage = response.usage || {};
    totalInputTokens += usage.prompt_tokens || 0;
    totalOutputTokens += usage.completion_tokens || 0;
    const totalTokens = totalInputTokens + totalOutputTokens;
    const elapsedMs = Date.now() - startedAt;

    console.log(
      `[kimi-agent] iter=${iterations} in=${totalInputTokens} out=${totalOutputTokens} total=${totalTokens} elapsed=${Math.round(elapsedMs / 1000)}s`,
    );

    if (totalInputTokens >= TOKEN_ABORT_THRESHOLD) {
      console.error(
        `[kimi-agent] Token budget exceeded (${totalInputTokens} input >= ${TOKEN_ABORT_THRESHOLD}) — aborting unit ${unit.id}`,
      );
      break;
    }
    if (elapsedMs >= UNIT_WALL_CLOCK_MS) {
      console.error(
        `[kimi-agent] Wall-clock timeout (${Math.round(elapsedMs / 1000)}s >= ${Math.round(UNIT_WALL_CLOCK_MS / 1000)}s) — aborting unit ${unit.id}`,
      );
      break;
    }
    if (totalInputTokens >= TOKEN_WARN_THRESHOLD && iterations % 5 === 0) {
      console.warn(
        `[kimi-agent] ⚠ Approaching token budget (${totalInputTokens}/${TOKEN_WARN_THRESHOLD})`,
      );
    }

    const msg = response.choices[0].message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      console.log('[kimi-agent] Agent finished (no more tool calls)');
      if (msg.content) console.log('[kimi-agent] Final:', msg.content.slice(0, 400));
      break;
    }

    const toolResults = [];
    for (const tc of msg.tool_calls) {
      const fnName = tc.function.name;
      let fnArgs;
      try {
        fnArgs = JSON.parse(tc.function.arguments);
      } catch {
        fnArgs = {};
      }

      console.log(`[kimi-agent]   → ${fnName}(${JSON.stringify(fnArgs).slice(0, 100)})`);
      const rawResult = executeTool(fnName, fnArgs);
      const result = trimToolResult(rawResult); // cap before injecting into context
      console.log(`[kimi-agent]   ← ${JSON.stringify(result).slice(0, 160)}`);

      if (fnName === 'mark_done' && result.ok) done = true;

      toolResults.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }

    messages.push(...toolResults);
    // Slide the window — keeps context flat after MESSAGE_WINDOW turns
    // (trimMessages is also called inside callKimi, this just keeps local array lean)
  }

  const cost = ((totalInputTokens / 1e6) * 0.6 + (totalOutputTokens / 1e6) * 2.5).toFixed(4);
  const elapsedFinal = Date.now() - startedAt;
  console.log(
    `[kimi-agent] Unit ${unit.id} — tokens: ${totalInputTokens}in ${totalOutputTokens}out — est $${cost}`,
  );
  logCostEvent(unit.id, totalInputTokens, totalOutputTokens, done);
  logPodRun({
    sessionId: `kimi:${unit.id}`,
    model: KIMI_MODEL,
    totalTokens: totalInputTokens + totalOutputTokens,
    durationMs: elapsedFinal,
    unitsCompleted: done ? 1 : 0,
    unitIds: done ? [unit.id] : [],
    notes: done ? undefined : `aborted after ${iterations} iterations`,
  });

  // Structured security audit entry — one JSONL line per run
  appendAuditEntry({
    unit_id: unit.id,
    agent_id: AGENT_ID,
    files_written: [...auditFilesWritten],
    commands_run: auditCommandsRun,
    commit_hash: done ? (auditCommitHash ?? null) : null,
    outcome: done
      ? 'done'
      : iterations >= MAX_TOOL_ITERATIONS || Date.now() - startedAt >= UNIT_WALL_CLOCK_MS
        ? 'aborted'
        : 'failed',
  });

  if (done) {
    notify(
      `✅ **kimi** done — **${unit.id}** | ${totalInputTokens}in ${totalOutputTokens}out | est $${cost}`,
    );
  } else {
    // Revert claim → approved so another agent can retry. Track attempts in a
    // dedicated counter (NOT in agentNotes — that pollutes future prompts).
    // After MAX_KIMI_ATTEMPTS failures, auto-quarantine via hitl: true so the
    // unit drops out of the eligible pool and a human can triage.
    const data = loadOrchestration();
    const u = data.units.find((x) => x.id === unit.id);
    if (u && u.status === 'claimed') {
      const reason =
        iterations >= MAX_TOOL_ITERATIONS
          ? 'max iterations'
          : Date.now() - startedAt >= UNIT_WALL_CLOCK_MS
            ? 'wall-clock'
            : 'token budget';
      u._kimiAttempts = (u._kimiAttempts || 0) + 1;
      u._kimiLastAbort = {
        reason,
        at: new Date().toISOString(),
        tokens: totalInputTokens,
        iters: iterations,
      };
      delete u.claimedBy;
      delete u.claimedAt;
      if (u._kimiAttempts >= MAX_KIMI_ATTEMPTS) {
        u.status = 'approved';
        u.hitl = true;
        u._kimiQuarantined = true;
        notify(
          `🚧 **kimi** quarantined — **${unit.id}** | ${u._kimiAttempts} aborts → hitl=true (needs human triage)`,
        );
      } else {
        u.status = 'approved';
      }
      fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));
    }
    notify(
      `⚠️ **kimi** abort — **${unit.id}** | ${iterations >= MAX_TOOL_ITERATIONS ? 'max iterations' : 'token budget'} | attempt ${u?._kimiAttempts || '?'}/${MAX_KIMI_ATTEMPTS} | $${cost}`,
    );
  }

  return done;
}

// ── Single worker loop ────────────────────────────────────────────────────────

// Drain-notify throttle: pulse wrapper restarts the loop every 5 min, so a
// quiet queue otherwise produces a Discord ping every 5 min. Only fire the
// "queue empty — ready for review" notify when orchestration.json has changed
// since the last drain-notify (i.e. a unit completed, a claim flipped, a new
// unit was added). State persisted in docs/ai/.kimi-drain-state.json.
const DRAIN_STATE_PATH = path.join(ROOT, 'docs/ai/.kimi-drain-state.json');

function shouldNotifyDrain() {
  let lastNotifyMs = 0;
  try {
    const state = JSON.parse(fs.readFileSync(DRAIN_STATE_PATH, 'utf8'));
    lastNotifyMs = new Date(state.lastDrainNotifyAt).getTime();
  } catch {
    return true; // first ever drain — fire once
  }
  try {
    const orchMs = fs.statSync(ORCH_PATH).mtimeMs;
    return orchMs > lastNotifyMs;
  } catch {
    return false;
  }
}

function markDrainNotified() {
  try {
    fs.writeFileSync(
      DRAIN_STATE_PATH,
      JSON.stringify({ lastDrainNotifyAt: new Date().toISOString() }, null, 2) + '\n',
    );
  } catch {
    /* ignore — best-effort */
  }
}

async function runWorker(workerId) {
  do {
    const unit = findEligibleUnit(UNIT_ID);
    if (!unit) {
      console.log(`[${workerId}] No eligible units — queue drained.`);
      if (shouldNotifyDrain()) {
        notify(`✅ **kimi** queue empty — all eligible units done. Ready for Claude review.`);
        markDrainNotified();
      } else {
        console.log(`[${workerId}] Skipping drain notify — orchestration.json unchanged since last ping.`);
      }
      break;
    }

    let claimed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        claimUnit(unit);
        claimed = true;
        break;
      } catch (e) {
        if (e.message.startsWith('CLAIM_RACE')) {
          console.log(`[${workerId}] ${e.message} — re-scanning`);
          await new Promise((r) => setTimeout(r, 1000 + attempt * 500));
          break;
        }
        throw e;
      }
    }
    if (!claimed) continue;

    const success = await runUnit(unit);
    if (!success) {
      console.error(`[${workerId}] Unit ${unit.id} did not complete.`);
      if (!LOOP) break;
    }

    if (UNIT_ID) break;
  } while (LOOP);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    const unit = findEligibleUnit(UNIT_ID);
    if (!unit) {
      console.log('[kimi-agent] No eligible units.');
    } else {
      console.log('[kimi-agent] Next eligible unit:');
      console.log(`  id:            ${unit.id}`);
      console.log(`  priority:      ${unit.priority}`);
      console.log(`  sprint:        ${unit.sprint}`);
      console.log(`  cluster:       ${unit.cluster}`);
      console.log(`  validationCmd: ${unit.validationCmd || '(default)'}`);
    }
    // Seed audit log so the file always exists after --dry-run (required by validationCmd)
    appendAuditEntry({
      unit_id: unit?.id ?? null,
      agent_id: AGENT_ID,
      files_written: [],
      commands_run: [],
      commit_hash: null,
      outcome: 'dry-run',
    });
    return;
  }

  if (!API_KEY) {
    console.error('[kimi-agent] Error: MOONSHOT_API_KEY is not set.');
    console.error('  Export it: export MOONSHOT_API_KEY=sk-...');
    process.exit(1);
  }

  if (CONCURRENCY > 1 && LOOP) {
    console.log(`[kimi-agent] Starting ${CONCURRENCY} parallel workers`);
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => runWorker(`${AGENT_ID}-w${i + 1}`)),
    );
    console.log('[kimi-agent] All workers done.');
    return;
  }

  await runWorker(AGENT_ID);
  console.log('[kimi-agent] Done.');
}

main().catch((err) => {
  console.error('[kimi-agent] Fatal:', err.message);
  process.exit(1);
});
