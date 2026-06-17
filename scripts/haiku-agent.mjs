#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/haiku-agent.mjs
 *
 * Autonomous unit executor powered by Claude Haiku 4.5 via Anthropic API.
 * Same orchestration protocol as hermes-unit — claim/done state machine,
 * scoping-discipline system prompt — but uses the Anthropic Messages API
 * with prompt caching on system + tools.
 *
 * RESTRICTED to T1 + T2 tier units only. Higher-tier units (T3 architectural,
 * T4 Claude-only) are skipped — Haiku is the cheap parallel lane for the
 * mechanical end of the queue.
 *
 * Runs alongside hermes-unit.mjs. Both can claim the same unit; the
 * commit-based claim race ensures only one wins.
 *
 * Modes:
 *   --unit <id>       execute a specific unit
 *   --loop            run continuously until queue is empty
 *   --dry-run         print the next eligible unit and exit
 *   --concurrency N   run N parallel workers
 *   --no-commit       observe only — git ops are stubbed
 *
 * Config (env vars):
 *   ANTHROPIC_API_KEY        required
 *   HAIKU_MODEL              default claude-haiku-4-5-20251001
 *   HAIKU_MAX_TOKENS         default 8192
 *   HAIKU_AGENT_ID           default haiku-agent
 *   HAIKU_MAX_ITERATIONS     default 12
 *   HAIKU_WARN_TOKENS        default 50_000
 *   HAIKU_ABORT_TOKENS       default 100_000
 *   HAIKU_MAX_ATTEMPTS       default 3
 *   HAIKU_UNIT_TIMEOUT_MS    default 480_000 (8 min)
 *
 * Invocation:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/haiku-agent.mjs --dry-run
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/haiku-agent.mjs --loop --concurrency 2
 */

import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH_PATH = path.join(ROOT, 'docs/ai/orchestration.json');
const QUEUE_PATH = path.join(ROOT, 'docs/ai/ready-queue.json');

// Auto-load .env.local so ANTHROPIC_API_KEY doesn't need a manual export
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const HAIKU_MODEL      = process.env.HAIKU_MODEL || 'claude-haiku-4-5-20251001';
const HAIKU_MAX_TOKENS = Number(process.env.HAIKU_MAX_TOKENS) || 8192;
const AGENT_ID         = process.env.HAIKU_AGENT_ID || 'haiku-agent';

const MAX_TOOL_ITERATIONS = Number(process.env.HAIKU_MAX_ITERATIONS) || 12;
const UNIT_WALL_CLOCK_MS  = Number(process.env.HAIKU_UNIT_TIMEOUT_MS) || 8 * 60 * 1000;

// Haiku 4.5 pricing: $1/1M input (uncached), $5/1M output, $0.10/1M cache reads.
// At 100K input ceiling that's ~$0.10 worst-case (less with cache hits).
const TOKEN_WARN_THRESHOLD  = Number(process.env.HAIKU_WARN_TOKENS)  || 50_000;
const TOKEN_ABORT_THRESHOLD = Number(process.env.HAIKU_ABORT_TOKENS) || 100_000;

const MAX_HAIKU_ATTEMPTS = Number(process.env.HAIKU_MAX_ATTEMPTS) || 3;

// Tier restriction — Haiku is for low-level mechanical work only.
// T3 (cross-cutting) and T4 (architectural) skip Haiku and route to Hermes/Claude.
const ALLOWED_TIERS = new Set(['T1', 'T2']);

const TOOL_RESULT_CAP = 6_144;
const MESSAGE_WINDOW  = 10;

const API_KEY = process.env.ANTHROPIC_API_KEY;

// ── CLI flags ─────────────────────────────────────────────────────────────────

const argv       = process.argv.slice(2);
const DRY_RUN    = argv.includes('--dry-run');
const LOOP       = argv.includes('--loop');
const NO_COMMIT  = argv.includes('--no-commit');
const unitIdx    = argv.indexOf('--unit');
const UNIT_ID    = unitIdx !== -1 ? argv[unitIdx + 1] : null;
const concurIdx  = argv.indexOf('--concurrency');
const CONCURRENCY = concurIdx !== -1 ? Math.max(1, parseInt(argv[concurIdx + 1], 10) || 1) : 1;

// ── Safety blocklist ──────────────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /git\s+push/,
  /pnpm\s+check:release/,
  /npm\s+publish/,
  /rm\s+-rf\s+[^n]/,
  /git\s+reset\s+--hard/,
  /curl.*\|.*sh/,
  /wget.*\|.*sh/,
];

function isSafeCommand(cmd) {
  for (const re of BLOCKED_PATTERNS) {
    if (re.test(cmd)) return false;
  }
  return true;
}

// ── Tool definitions (Anthropic format) ──────────────────────────────────────
// These are STATIC — never reorder or mutate at runtime, the prompt cache
// keys off byte-for-byte equality of the rendered tools array.

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read a file from the repository. Use this before editing.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Repo-relative path, e.g. src/app/components/button.tsx' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write (overwrite) a file. Always read first unless creating new.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'Repo-relative path.' },
        content: { type: 'string', description: 'Full file content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_bash',
    description: 'Run a shell command in the repo root. Blocklisted: git push, pnpm check:release, rm -rf (non-node_modules), npm publish.',
    input_schema: {
      type: 'object',
      properties: {
        command:    { type: 'string', description: 'Shell command to run.' },
        timeout_ms: { type: 'number', description: 'Max ms to wait. Default 30000.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files in a directory (non-recursive by default).',
    input_schema: {
      type: 'object',
      properties: {
        path:      { type: 'string', description: 'Repo-relative directory path.' },
        recursive: { type: 'boolean', description: 'List recursively. Default false.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_unit',
    description: 'Get full details for an orchestration unit by ID.',
    input_schema: {
      type: 'object',
      properties: {
        unit_id: { type: 'string', description: 'Unit ID, e.g. 12g-1-agent-infra-p0-fixes.' },
      },
      required: ['unit_id'],
    },
  },
  {
    name: 'mark_done',
    description: 'Mark the current unit as done in orchestration.json. Call this AFTER validationCmd passes and your commit is made.',
    input_schema: {
      type: 'object',
      properties: {
        unit_id:        { type: 'string' },
        commit_hash:    { type: 'string', description: 'Short git hash of the unit commit.' },
        completion_note:{ type: 'string', description: 'One-line summary of what was done.' },
      },
      required: ['unit_id'],
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
        return content.length > 20480
          ? { content: content.slice(0, 20480), truncated: true, total_bytes: content.length }
          : { content };
      }

      case 'write_file': {
        const abs = path.resolve(ROOT, args.path);
        if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) {
          return { error: `Path traversal blocked: ${args.path} escapes repo root` };
        }
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, args.content, 'utf8');
        if (NO_COMMIT) console.log(`[haiku-agent] [no-commit] wrote ${args.path} (git commit suppressed)`);
        return { ok: true, bytes_written: args.content.length };
      }

      case 'run_bash': {
        if (!isSafeCommand(args.command)) {
          return { error: `Blocked command (safety policy): ${args.command}` };
        }
        if (NO_COMMIT && /git\s+(add|commit|checkout\s+--)/.test(args.command)) {
          console.log(`[haiku-agent] [no-commit] WOULD run: ${args.command}`);
          const fakeHash = Math.random().toString(16).slice(2, 9);
          const subject = args.command.match(/-m\s+["']([^"']{0,80})/)?.[1] || 'committed';
          return { stdout: `[fix/ui-pipeline ${fakeHash}] ${subject}\n 1 file changed`, exit_code: 0, dry_run: true };
        }
        try {
          const out = execSync(args.command, {
            cwd: ROOT,
            timeout: args.timeout_ms || 30000,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          if (out.includes('\0')) {
            return { stdout: '[binary output suppressed — likely cat on a binary file]', exit_code: 0, warning: 'binary' };
          }
          return { stdout: out, exit_code: 0 };
        } catch (e) {
          const stdout = (e.stdout || '').includes('\0') ? '[binary output suppressed]' : (e.stdout || '');
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
          const out = execFileSync('find', [abs, '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*', '-type', 'f'], { encoding: 'utf8' });
          return { files: out.trim().split('\n').filter(Boolean).map(f => path.relative(ROOT, f)) };
        }
        const entries = fs.readdirSync(abs, { withFileTypes: true });
        return { entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })) };
      }

      case 'get_unit': {
        const data = JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
        const unit = data.units.find(u => u.id === args.unit_id);
        if (!unit) return { error: `Unit not found: ${args.unit_id}` };
        return { unit };
      }

      case 'mark_done': {
        const data = JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
        const unit = data.units.find(u => u.id === args.unit_id);
        if (!unit) return { error: `Unit not found: ${args.unit_id}` };
        unit.status = 'done';
        unit.completedAt = new Date().toISOString().slice(0, 10);
        if (args.commit_hash) unit.completedCommit = args.commit_hash;
        if (args.completion_note) unit.completionNote = args.completion_note;
        if (NO_COMMIT) {
          console.log(`[haiku-agent] [no-commit] WOULD mark ${args.unit_id} done`);
          return { ok: true, unit_id: args.unit_id, completedAt: unit.completedAt, dry_run: true };
        }
        fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));
        try {
          execSync(
            `git add docs/ai/orchestration.json && git commit --no-verify -m "chore(orch): mark ${args.unit_id} done [haiku-agent]"`,
            { cwd: ROOT, stdio: 'inherit' }
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

// ── Discord notifications ─────────────────────────────────────────────────────

function notify(msg) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    execSync(
      `curl -s -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify({ content: msg }))} "${url}"`,
      { stdio: 'ignore', timeout: 5000 }
    );
  } catch { /* non-fatal */ }
}

// ── Orchestration helpers ─────────────────────────────────────────────────────

function loadOrchestration() {
  return JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
}

function unitTier(unit, queueEntry) {
  // Prefer the queue's classified tier (set by orchestration-watcher); fall
  // back to a unit field if present.
  return queueEntry?.tier || unit?.tier || null;
}

function isHaikuEligible(u, queueEntry) {
  if (u.hitl) return false;
  if (u._haikuQuarantined) return false;
  if ((u._haikuAttempts || 0) >= MAX_HAIKU_ATTEMPTS) return false;
  const tier = unitTier(u, queueEntry);
  if (!tier || !ALLOWED_TIERS.has(tier)) return false;
  return true;
}

function findEligibleUnit(unitId) {
  const data = loadOrchestration();

  if (unitId) {
    const unit = data.units.find(u => u.id === unitId);
    if (!unit) throw new Error(`Unit not found: ${unitId}`);
    return unit;
  }

  // Try ready-queue first (has the tier classification we need)
  if (fs.existsSync(QUEUE_PATH)) {
    const q = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const queuedAge = Date.now() - Date.parse(q.generatedAt);
    if (queuedAge < 10 * 60 * 1000 && q.eligible?.length > 0) {
      for (const e of q.eligible) {
        if (e.status !== 'approved' || e.hitl) continue;
        if (!ALLOWED_TIERS.has(e.tier)) continue;
        const u = data.units.find(x => x.id === e.id);
        if (u && isHaikuEligible(u, e)) return u;
      }
    }
  }

  // Fallback: no queue means no tier info → can't decide eligibility safely.
  // Return null and let the caller wait for the watcher to refresh.
  console.warn('[haiku-agent] No fresh ready-queue.json — cannot classify tiers. Run orchestration-watcher first.');
  return null;
}

function claimUnit(unit) {
  const data = loadOrchestration();
  const u = data.units.find(x => x.id === unit.id);
  if (!u) throw new Error(`CLAIM_RACE: unit ${unit.id} disappeared`);
  if (u.status !== 'approved') throw new Error(`CLAIM_RACE: unit ${unit.id} already ${u.status} by ${u.claimedBy || 'unknown'}`);

  u.status = 'claimed';
  u.claimedBy = AGENT_ID;
  u.claimedAt = new Date().toISOString();

  if (NO_COMMIT) {
    console.log(`[haiku-agent] [no-commit] WOULD claim ${unit.id}`);
    return;
  }

  fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));

  try {
    execSync(
      `git add docs/ai/orchestration.json && git commit --no-verify -m "chore(orch): claim ${unit.id} for ${AGENT_ID}"`,
      { cwd: ROOT, stdio: 'inherit' }
    );
  } catch {
    const fresh = loadOrchestration();
    const uf = fresh.units.find(x => x.id === unit.id);
    if (uf) { uf.status = 'approved'; delete uf.claimedBy; delete uf.claimedAt; }
    fs.writeFileSync(ORCH_PATH, JSON.stringify(fresh, null, 2));
    throw new Error(`CLAIM_RACE: commit failed for ${unit.id} — another instance claimed it first`);
  }
  console.log(`[haiku-agent] Claimed ${unit.id}`);
}

// ── System prompt builder ─────────────────────────────────────────────────────

const DESC_CAP  = 800;
const NOTES_CAP = 400;

function capText(text, cap) {
  if (!text) return '';
  const s = Array.isArray(text) ? text.map(String).join('\n') : String(text);
  return s.length > cap ? s.slice(0, cap) + ' …[truncated]' : s;
}

const ABORT_MARKER_RE = /\s*\[\s*(hermes|haiku)\s+abort[^\]]*\][^\n,]*/gi;
function stripAbortSpam(text) {
  if (!text) return text;
  if (Array.isArray(text)) return text.map(stripAbortSpam);
  return String(text).replace(ABORT_MARKER_RE, '').replace(/,+/g, ',').trim();
}

function buildSystemPrompt(unit) {
  const desc     = capText(stripAbortSpam(unit.description), DESC_CAP);
  const notes    = capText(stripAbortSpam(unit.agentNotes),  NOTES_CAP);
  const fileList = Array.isArray(unit.files) && unit.files.length > 0
    ? unit.files.join(', ')
    : null;
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
You are on a hard 100K input-token budget. Most low-level units close in 3-6 tool calls.
Past 12 calls or 100K tokens you are aborted and the unit is re-queued.

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
   Append to body: "Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
4. After the commit, call mark_done with the short commit hash.
5. Never git push, never pnpm check:release, never rm -rf (except node_modules).
6. If you hit a blocker you cannot resolve in 3 attempts, stop and output "BLOCKER: <reason>".

SAFETY: run_bash blocks git push, pnpm check:release, and destructive commands.

The full unit spec is above. Begin working — read relevant files, make changes, validate, commit.${NO_COMMIT ? `

OBSERVATION MODE (--no-commit): git add/commit calls are stubbed — they return fake success but nothing is committed. Do NOT loop on git status after a commit call. After the validationCmd passes and you would normally commit, call mark_done directly with any placeholder hash. The goal is to exercise the tool loop, not persist changes.` : ''}`;
}

// ── Token-safe helpers ────────────────────────────────────────────────────────

function trimToolResult(result) {
  const raw = JSON.stringify(result);
  if (raw.length <= TOOL_RESULT_CAP) return result;

  if (result.stdout !== undefined) {
    const tail = (result.stdout + (result.stderr || '')).slice(-TOOL_RESULT_CAP + 100);
    return {
      stdout: tail,
      exit_code: result.exit_code,
      _trimmed: true,
      _original_bytes: raw.length,
    };
  }

  if (result.content !== undefined) {
    return {
      content: result.content.slice(0, TOOL_RESULT_CAP),
      _trimmed: true,
      _original_bytes: raw.length,
    };
  }

  return { _raw_trimmed: raw.slice(0, TOOL_RESULT_CAP), _original_bytes: raw.length };
}

/**
 * Slide the message window. In Anthropic's API, tool_result blocks live inside
 * a USER message (not a separate "tool" role like OpenAI). Each turn-pair is:
 *   assistant message (with tool_use blocks)
 *   user message (with tool_result blocks for those tool_uses)
 * We must keep these paired or the API rejects the next request.
 */
function trimMessages(messages) {
  if (messages.length <= 2) return messages;

  // Group: assistant + the immediately-following user-with-tool-results form one turn.
  const turns = [];
  let i = 0;
  // The first message is the seed user prompt — keep it as turn 0.
  turns.push([messages[0]]);
  i = 1;
  while (i < messages.length) {
    const turn = [messages[i]];
    // If next is a user with tool_result content, glue it to this turn.
    if (
      messages[i].role === 'assistant'
      && i + 1 < messages.length
      && messages[i + 1].role === 'user'
      && Array.isArray(messages[i + 1].content)
      && messages[i + 1].content.some(b => b?.type === 'tool_result')
    ) {
      turn.push(messages[i + 1]);
      i += 2;
    } else {
      i += 1;
    }
    turns.push(turn);
  }

  if (turns.length <= MESSAGE_WINDOW + 1) return messages;

  const seed = turns[0];
  const kept = turns.slice(-MESSAGE_WINDOW);
  return [...seed, ...kept.flat()];
}

// ── Anthropic API call ────────────────────────────────────────────────────────

let _anthropicClient = null;
async function getClient() {
  if (_anthropicClient) return _anthropicClient;
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  _anthropicClient = new Anthropic({ apiKey: API_KEY });
  return _anthropicClient;
}

async function callHaiku(systemPrompt, messages) {
  if (!API_KEY) {
    throw new Error('ANTHROPIC_API_KEY env var required. Set it and re-run.');
  }
  const client = await getClient();

  // Cache the system prompt + tools together. Render order is tools → system →
  // messages, so a cache_control marker on the system block also caches all
  // upstream tool definitions. This is a major win across iterations within a
  // unit — every loop after the first reads the prefix at ~10% of full price.
  return client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: HAIKU_MAX_TOKENS,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    tools: TOOLS,
    messages: trimMessages(messages),
  });
}

// ── Agent loop ────────────────────────────────────────────────────────────────

async function runUnit(unit) {
  console.log(`\n[haiku-agent] Starting unit: ${unit.id}`);
  console.log(`[haiku-agent] Model: ${HAIKU_MODEL}`);

  const systemPrompt = buildSystemPrompt(unit);
  const messages = [
    { role: 'user', content: `Execute unit "${unit.id}". The full spec is in the system prompt. Begin working now.` },
  ];

  let iterations = 0;
  let done = false;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  const startedAt = Date.now();

  while (!done && iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    let response;
    try {
      response = await callHaiku(systemPrompt, messages);
    } catch (err) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      if (err instanceof Anthropic.RateLimitError) {
        console.error(`[haiku-agent] Rate limited — SDK retried already, giving up: ${err.message}`);
      } else if (err instanceof Anthropic.APIError) {
        console.error(`[haiku-agent] Anthropic API error ${err.status}: ${err.message}`);
      } else {
        console.error(`[haiku-agent] Unexpected error: ${err.message}`);
      }
      break;
    }

    const usage = response.usage || {};
    totalInputTokens      += (usage.input_tokens || 0);
    totalOutputTokens     += (usage.output_tokens || 0);
    totalCacheReadTokens  += (usage.cache_read_input_tokens || 0);
    totalCacheWriteTokens += (usage.cache_creation_input_tokens || 0);
    const totalIn = totalInputTokens + totalCacheReadTokens + totalCacheWriteTokens;
    const elapsedMs = Date.now() - startedAt;

    console.log(`[haiku-agent] iter=${iterations} in=${totalInputTokens} cache_r=${totalCacheReadTokens} cache_w=${totalCacheWriteTokens} out=${totalOutputTokens} elapsed=${Math.round(elapsedMs/1000)}s`);

    if (totalIn >= TOKEN_ABORT_THRESHOLD) {
      console.error(`[haiku-agent] Token budget exceeded (${totalIn} >= ${TOKEN_ABORT_THRESHOLD}) — aborting unit ${unit.id}`);
      break;
    }
    if (elapsedMs >= UNIT_WALL_CLOCK_MS) {
      console.error(`[haiku-agent] Wall-clock timeout (${Math.round(elapsedMs/1000)}s) — aborting unit ${unit.id}`);
      break;
    }
    if (totalIn >= TOKEN_WARN_THRESHOLD && iterations % 3 === 0) {
      console.warn(`[haiku-agent] ⚠ Approaching token budget (${totalIn}/${TOKEN_WARN_THRESHOLD})`);
    }

    // Append the assistant turn — preserving the FULL content array so
    // tool_use blocks stay paired with their tool_result responses next turn.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || !response.content.some(b => b.type === 'tool_use')) {
      console.log('[haiku-agent] Agent finished (end_turn / no tool calls)');
      const text = response.content.find(b => b.type === 'text')?.text;
      if (text) console.log('[haiku-agent] Final:', text.slice(0, 400));
      break;
    }

    if (response.stop_reason === 'max_tokens') {
      console.error(`[haiku-agent] Hit max_tokens cap — aborting unit ${unit.id}`);
      break;
    }
    if (response.stop_reason === 'refusal') {
      console.error(`[haiku-agent] Model refused — aborting unit ${unit.id}`);
      break;
    }

    // Process tool_use blocks — execute, build tool_result blocks for the
    // next user turn. Anthropic requires a tool_result for every tool_use.
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const fnName = block.name;
      const fnArgs = block.input || {};

      console.log(`[haiku-agent]   → ${fnName}(${JSON.stringify(fnArgs).slice(0, 100)})`);
      const rawResult = executeTool(fnName, fnArgs);
      const result = trimToolResult(rawResult);
      console.log(`[haiku-agent]   ← ${JSON.stringify(result).slice(0, 160)}`);

      if (fnName === 'mark_done' && result.ok) done = true;

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    if (toolResults.length === 0) {
      console.warn('[haiku-agent] stop_reason=tool_use but no tool_use blocks found — aborting');
      break;
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Cost: $1/1M uncached in, $5/1M out, $0.10/1M cache read, $1.25/1M cache write
  const cost = (
    (totalInputTokens / 1e6) * 1.00 +
    (totalOutputTokens / 1e6) * 5.00 +
    (totalCacheReadTokens / 1e6) * 0.10 +
    (totalCacheWriteTokens / 1e6) * 1.25
  ).toFixed(4);
  console.log(`[haiku-agent] Unit ${unit.id} — tokens: in=${totalInputTokens} cache_r=${totalCacheReadTokens} cache_w=${totalCacheWriteTokens} out=${totalOutputTokens} — est $${cost}`);

  if (done) {
    notify(`✅ **haiku** done — **${unit.id}** | ${totalInputTokens}in ${totalCacheReadTokens}cache_r ${totalOutputTokens}out | est $${cost}`);
  } else {
    const data = loadOrchestration();
    const u = data.units.find(x => x.id === unit.id);
    if (u && u.status === 'claimed') {
      const reason = iterations >= MAX_TOOL_ITERATIONS
        ? 'max iterations'
        : (Date.now() - startedAt >= UNIT_WALL_CLOCK_MS ? 'wall-clock' : 'token budget');
      u._haikuAttempts = (u._haikuAttempts || 0) + 1;
      u._haikuLastAbort = { reason, at: new Date().toISOString(), tokens: totalInputTokens + totalCacheReadTokens, iters: iterations };
      delete u.claimedBy;
      delete u.claimedAt;
      if (u._haikuAttempts >= MAX_HAIKU_ATTEMPTS) {
        u.status = 'approved';
        u.hitl = true;
        u._haikuQuarantined = true;
        notify(`🚧 **haiku** quarantined — **${unit.id}** | ${u._haikuAttempts} aborts → hitl=true (needs human triage)`);
      } else {
        u.status = 'approved';
      }
      fs.writeFileSync(ORCH_PATH, JSON.stringify(data, null, 2));
    }
    notify(`⚠️ **haiku** abort — **${unit.id}** | ${iterations >= MAX_TOOL_ITERATIONS ? 'max iterations' : 'token budget'} | attempt ${u?._haikuAttempts || '?'}/${MAX_HAIKU_ATTEMPTS} | $${cost}`);
  }

  return done;
}

// ── Single worker loop ────────────────────────────────────────────────────────

async function runWorker(workerId) {
  do {
    const unit = findEligibleUnit(UNIT_ID);
    if (!unit) {
      console.log(`[${workerId}] No eligible T1/T2 units — queue drained.`);
      notify(`✅ **haiku** queue empty — all eligible T1/T2 units done.`);
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
          await new Promise(r => setTimeout(r, 1000 + attempt * 500));
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
      console.log('[haiku-agent] No eligible T1/T2 units.');
    } else {
      console.log('[haiku-agent] Next eligible unit:');
      console.log(`  id:            ${unit.id}`);
      console.log(`  priority:      ${unit.priority}`);
      console.log(`  sprint:        ${unit.sprint}`);
      console.log(`  cluster:       ${unit.cluster}`);
      console.log(`  validationCmd: ${unit.validationCmd || '(default)'}`);
    }
    return;
  }

  if (!API_KEY) {
    console.error('[haiku-agent] Error: ANTHROPIC_API_KEY is not set.');
    console.error('  Set it in .env.local or export it: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  if (CONCURRENCY > 1 && LOOP) {
    console.log(`[haiku-agent] Starting ${CONCURRENCY} parallel workers`);
    await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) => runWorker(`${AGENT_ID}-w${i + 1}`))
    );
    console.log('[haiku-agent] All workers done.');
    return;
  }

  await runWorker(AGENT_ID);
  console.log('[haiku-agent] Done.');
}

main().catch(err => {
  console.error('[haiku-agent] Fatal:', err.message);
  process.exit(1);
});
