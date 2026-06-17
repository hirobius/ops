#!/usr/bin/env node
/**
 * scripts/discord-bot.mjs
 *
 * Hirobius HQ — Discord bot with Claude API integration.
 *
 * Primary mode: natural language conversation powered by Claude.
 *   Just talk — "what's in the queue?", "run the YouTube scraper", "what should I do today?"
 *
 * Quick shortcuts (! prefix):
 *   !help    — list shortcuts
 *   !status  — BACKLOG.md summary embed (fast, no AI)
 *   !backlog [filter] — backlog digest; filter by category or status
 *   !next / !today — AI picks top 1-3 ready items for today + reasoning
 *   !recent [days] — BACKLOG.md changes from git log (default 7d)
 *   !shell <cmd> — raw shell passthrough
 *   !log [n] — tail cron log
 *   !provider [name] — show or set AI provider for this channel
 *   !local / !cloud — sticky channel switch to Ollama / Anthropic
 *
 * Thread mode:
 *   Reply to bot in a thread → isolated conversation with full context.
 *   New message in main channel → fresh context.
 *
 * Required env vars in .env.local:
 *   DISCORD_BOT_TOKEN=<bot token from Discord Dev Portal>
 *   DISCORD_OWNER_ID=<your Discord user ID (right-click → Copy User ID)>
 *   DISCORD_GUILD_ID=<your server ID (optional — limits to one server)>
 *
 * AI provider — Ollama is the local-first default (machine has to be
 * running for /ops/kanban + Hermes anyway; cloud calls cost money). Override
 * the default with DISCORD_BOT_PROVIDER, override per-channel with `!provider`.
 *   DISCORD_BOT_PROVIDER=ollama       ← default; explicit `anthropic`/`openrouter` to flip
 *   ANTHROPIC_API_KEY=<key>           ← needed for `!cloud` / `!provider anthropic`
 *   OPENROUTER_API_KEY=<key>          ← needed for `!provider openrouter`
 *   DISCORD_BOT_MODEL=anthropic/claude-sonnet-4-6  ← only used with OpenRouter
 *   OLLAMA_BASE_URL=http://localhost:11434  ← default; change if Ollama is remote
 *   OLLAMA_MODEL=hermes3              ← default local model
 *
 * Hermes → Discord bridge (used by scripts/hermes-discord-bridge.mjs):
 *   DISCORD_HERMES_CHANNEL_ID=<channel id>          ← default thread parent
 *   DISCORD_CHANNEL_<TENANT-OR-SLUG>=<channel id>   ← per-client/tenant override
 *
 * Setup:
 *   1. Create a bot at https://discord.com/developers/applications
 *   2. Enable "Message Content Intent" under Bot → Privileged Gateway Intents
 *   3. Add to server with scopes: bot + applications.commands, permissions: Send Messages + Read Messages
 *   4. pnpm bot
 *
 * Persistent:
 *   pm2 start scripts/discord-bot.mjs --name hq-bot --interpreter node
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Auto-load .env.local
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const BOT_TOKEN       = process.env.DISCORD_BOT_TOKEN;
const OWNER_ID        = process.env.DISCORD_OWNER_ID;
const GUILD_ID        = process.env.DISCORD_GUILD_ID;
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const BOT_MODEL       = process.env.DISCORD_BOT_MODEL || 'anthropic/claude-sonnet-4-6';
const OLLAMA_BASE     = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL || 'hermes3';
// Provider default: 'ollama' (local, free, machine has to be running anyway).
// Override with DISCORD_BOT_PROVIDER=anthropic | openrouter to default to a
// cloud provider when its key is configured. In-channel `!provider <name>`
// overrides the default per-channel/thread.
const BOT_PROVIDER_DEFAULT = (process.env.DISCORD_BOT_PROVIDER || 'ollama').toLowerCase();
const BACKLOG_PATH    = path.join(ROOT, 'BACKLOG.md');
// Default client for the auto-assigner when a non-! message has no [slug]
// prefix. Override via env when the bot lives in a multi-client server.
const DEFAULT_CLIENT  = process.env.DISCORD_DEFAULT_CLIENT || 'lilac-insure';
const LOG_FILE        = '/tmp/youtube-knowledge-cron.log';
const HERMES_LOG      = '/tmp/hermes-loop.log';

if (!BOT_TOKEN) { console.error('[bot] DISCORD_BOT_TOKEN not set in .env.local'); process.exit(1); }
if (!OWNER_ID)  { console.error('[bot] DISCORD_OWNER_ID not set in .env.local');  process.exit(1); }

// ── AI provider selection ─────────────────────────────────────────────────────
// Default: Ollama (local). Adrian's machine is always running for /ops/kanban
// and Hermes anyway, so local-first matches the deployment shape and costs $0.
// Override default with DISCORD_BOT_PROVIDER=anthropic | openrouter. Override
// per-channel at runtime with `!provider <name>` / `!local` / `!cloud`.

let Anthropic;
let anthropic = null;

const ANTHROPIC_AVAILABLE  = !!ANTHROPIC_KEY;
const OPENROUTER_AVAILABLE = !!OPENROUTER_KEY;

// Initialize Anthropic SDK lazily if its key is present, regardless of
// default — `!provider anthropic` should work even when default is ollama.
if (ANTHROPIC_AVAILABLE) {
  try {
    ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
  } catch {
    console.warn('[bot] @anthropic-ai/sdk not installed — run: pnpm add -D @anthropic-ai/sdk');
  }
}

function describeProvider(name) {
  if (name === 'anthropic')  return `Anthropic — model: claude-sonnet-4-6`;
  if (name === 'openrouter') return `OpenRouter — model: ${BOT_MODEL}`;
  return `Ollama (local) — model: ${OLLAMA_MODEL} @ ${OLLAMA_BASE}`;
}

console.log(`[bot] default AI provider: ${describeProvider(BOT_PROVIDER_DEFAULT)}`);
if (BOT_PROVIDER_DEFAULT === 'anthropic' && !anthropic) {
  console.warn('[bot] DISCORD_BOT_PROVIDER=anthropic but ANTHROPIC_API_KEY missing or SDK not loaded — falling back to Ollama at runtime');
}
if (BOT_PROVIDER_DEFAULT === 'openrouter' && !OPENROUTER_AVAILABLE) {
  console.warn('[bot] DISCORD_BOT_PROVIDER=openrouter but OPENROUTER_API_KEY missing — falling back to Ollama at runtime');
}

// ── Discord ───────────────────────────────────────────────────────────────────

let Client, GatewayIntentBits, Partials;
try {
  ({ Client, GatewayIntentBits, Partials } = await import('discord.js'));
} catch {
  console.error('[bot] discord.js not installed. Run: pnpm add -D discord.js');
  process.exit(1);
}

// ── Thread context store (in-memory) ─────────────────────────────────────────
// Key: channelId or threadId → last N message pairs

const MAX_HISTORY = 8;
const contexts = new Map(); // channelId → Array<{role, content}>

// Per-channel sticky provider override. Set via `!provider <name>` /
// `!local` / `!cloud`. Falls back to BOT_PROVIDER_DEFAULT when no entry.
const providerOverrides = new Map(); // channelId → 'ollama' | 'anthropic' | 'openrouter'

function pickProvider(channelId) {
  const override = providerOverrides.get(channelId);
  const choice = override ?? BOT_PROVIDER_DEFAULT;
  // Runtime fallback if a provider is requested but unavailable.
  if (choice === 'anthropic'  && !anthropic)           return 'ollama';
  if (choice === 'openrouter' && !OPENROUTER_AVAILABLE) return 'ollama';
  return choice;
}

function getHistory(channelId) {
  return contexts.get(channelId) || [];
}

function addToHistory(channelId, role, content) {
  const history = getHistory(channelId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY * 2) history.splice(0, 2);
  contexts.set(channelId, history);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk(text, limit = 1900) {
  const parts = [];
  while (text.length > limit) {
    let cut = text.lastIndexOf('\n', limit);
    if (cut < 0) cut = limit;
    parts.push(text.slice(0, cut));
    text = text.slice(cut).trimStart();
  }
  if (text) parts.push(text);
  return parts;
}

async function send(channel, text) {
  const parts = chunk(text);
  for (const part of parts) {
    await channel.send(part);
  }
}

function shell(cmd, timeoutMs = 30_000) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

// ── BACKLOG.md parsing ────────────────────────────────────────────────────────
// Parses the single source of truth at /BACKLOG.md. Format per item:
//   - `status` **id** — title
// Sections delimited by `## Category Name _(N)_` headers.

function parseBacklog() {
  if (!fs.existsSync(BACKLOG_PATH)) {
    return { items: [], categories: {}, statuses: {} };
  }
  const text = fs.readFileSync(BACKLOG_PATH, 'utf8');
  const items = [];
  let currentCategory = 'Uncategorized';
  for (const line of text.split('\n')) {
    const sectMatch = line.match(/^##\s+(.+?)(?:\s+_\([0-9]+\)_)?\s*$/);
    if (sectMatch) {
      const heading = sectMatch[1].trim();
      // Skip non-category sections like "Conventions" and "What used to live here"
      if (/^(Conventions|What used to live here)$/i.test(heading)) {
        currentCategory = null;
        continue;
      }
      currentCategory = heading;
      continue;
    }
    if (!currentCategory) continue;
    const itemMatch = line.match(/^-\s+`([^`]+)`\s+\*\*([^*]+)\*\*\s+—\s+(.+?)\s*$/);
    if (itemMatch) {
      const [, status, id, title] = itemMatch;
      items.push({ status: status.trim(), id: id.trim(), title: title.trim(), category: currentCategory });
    }
  }
  const byCategory = {}, byStatus = {};
  for (const it of items) {
    (byCategory[it.category] = byCategory[it.category] || []).push(it);
    byStatus[it.status] = (byStatus[it.status] || 0) + 1;
  }
  return { items, categories: byCategory, statuses: byStatus };
}

// Tiny fuzzy category resolver for !backlog <name> — accepts partial / case-insensitive
function resolveCategory(input, categories) {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  return Object.keys(categories).find(c => c.toLowerCase().includes(q)) || null;
}

const STATUS_EMOJI = {
  ready:           '🟢',
  blocked:         '🔴',
  parked:          '⚪',
  'needs-grilling': '🟡',
  idea:            '💡',
};
function statusEmoji(s) { return STATUS_EMOJI[s] || '⬜'; }

// ── Client workspace summary ──────────────────────────────────────────────────

function getClientStatus(slug) {
  const clientDir = path.join(ROOT, 'clients', slug);
  if (!fs.existsSync(clientDir)) return `No client workspace found at clients/${slug}`;

  const read = (file) => {
    const p = path.join(clientDir, file);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };

  const meta      = read('meta.json');
  const tasks     = read('tasks.json');
  const retainer  = read('retainer.json');
  const checklist = read('checklist.json');

  const lines = [];

  if (meta) {
    lines.push(`**${meta.company || slug}**  |  ${meta.location || ''}  |  ${meta.customerCount || '?'} customers`);
    lines.push(`Phase: ${meta.currentPhase || '?'}  |  Status: ${meta.status || '?'}`);
    lines.push('');
  }

  if (retainer) {
    const p = retainer.currentPhase;
    lines.push(`**Retainer:** ${p.phase} — $${p.scopedAt} — ${p.status}`);
    if (retainer.blockers?.length) {
      lines.push(`Blockers: ${retainer.blockers.join('; ')}`);
    }
    lines.push('');
  }

  if (tasks) {
    const phases = Array.isArray(tasks) ? tasks : (tasks.phases || [tasks]);
    for (const phase of phases) {
      const buckets = phase.buckets || [];
      const phaseLabel = phase.phase || phase.id || 'Tasks';
      const status = phase.status || '';
      lines.push(`**${phaseLabel}** ${status}`);
      for (const bucket of buckets) {
        const items = bucket.tasks || [];
        const open  = items.filter(t => t.status !== 'done' && t.status !== 'complete');
        if (!open.length) continue;
        lines.push(`  [${bucket.name || bucket.id}]`);
        for (const t of open.slice(0, 4)) {
          const flag = t.status === 'blocked' ? '🔴' : t.status === 'in-progress' ? '🟡' : '⬜';
          lines.push(`    ${flag} ${t.task || t.item}`);
        }
        if (open.length > 4) lines.push(`    … +${open.length - 4} more`);
      }
      lines.push('');
    }
  }

  if (checklist) {
    const cats = checklist.categories || [];
    const blockedItems = cats.flatMap(c => (c.items || []).filter(i => i.status === 'blocked'));
    const inProgress   = cats.flatMap(c => (c.items || []).filter(i => i.status === 'in-progress'));
    if (blockedItems.length) {
      lines.push(`**Blocked (${blockedItems.length}):** ${blockedItems.map(i => i.item).slice(0, 3).join('; ')}`);
    }
    if (inProgress.length) {
      lines.push(`**In-progress (${inProgress.length}):** ${inProgress.map(i => i.item).slice(0, 3).join('; ')}`);
    }
  }

  return lines.join('\n') || `Client workspace loaded for ${slug} — no structured data found.`;
}

// ── Tool definitions (provider-agnostic schema) ───────────────────────────────

const TOOL_DEFS = [
  {
    name: 'shell_exec',
    description: 'Run a shell command in the project root (/home/adrian/projects/adrian-milsap). Use for git status, running scripts, checking logs, triggering builds. Returns stdout. Avoid interactive or long-running commands.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file from the project. Paths relative to project root.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        lines: { type: 'number', description: 'Max lines to return (default 50)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_orchestration',
    description: 'Get a summary of the orchestration queue: done/claimed/approved counts, active workers, next eligible units.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'client_status',
    description: 'Get a status summary for a Hirobius client workspace: tasks by phase/swimlane, checklist blockers, retainer/payment status. Use when asked about a client like "lilac", "lilac insure", "Conrad", etc.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Client slug directory name, e.g. "lilac-insure"' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'sync_client_emails',
    description: 'Parse Gmail threads for a client and extract action items / status updates into the client workspace files. Runs scripts/sync-client-emails.mjs.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Client slug, e.g. "lilac-insure"' },
        dry_run: { type: 'boolean', description: 'If true, print findings without writing files' },
      },
      required: ['slug'],
    },
  },
];

// Anthropic SDK format
const TOOLS_ANTHROPIC = TOOL_DEFS.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters,
}));

// OpenAI/OpenRouter format
const TOOLS_OPENAI = TOOL_DEFS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

function executeTool(name, input) {
  try {
    if (name === 'shell_exec') {
      return shell(input.command, 20_000) || '(no output)';
    }
    if (name === 'read_file') {
      const full = path.join(ROOT, input.path);
      if (!fs.existsSync(full)) return `File not found: ${input.path}`;
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      return lines.slice(0, input.lines || 50).join('\n');
    }
    if (name === 'get_orchestration') {
      return JSON.stringify(getOrchSummary(), null, 2);
    }
    if (name === 'client_status') {
      return getClientStatus(input.slug || 'lilac-insure');
    }
    if (name === 'sync_client_emails') {
      const dryFlag = input.dry_run ? '--dry-run' : '';
      return shell(`node scripts/sync-client-emails.mjs ${input.slug} ${dryFlag}`.trim(), 60_000);
    }
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Error: ${e.message}`;
  }
}

// ── Claude conversation ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Hirobius HQ assistant, embedded in Discord for Adrian Milsap (solo founder, design systems engineer, AI agency builder).

Project root: /home/adrian/projects/adrian-milsap
Active branch: fix/ui-pipeline
Stack: Next.js 15, React 19, TypeScript, pnpm, Ollama (local AI), Discord

You have access to tools to check orchestration status, run scripts, and read files.

Your role:
- Help Adrian manage the Hirobius Design System build pipeline
- Answer questions about build status, queued units, agent activity
- Trigger scripts when asked — just run them, don't ask for confirmation
- Keep responses short and direct — 3 sentences max unless asked for detail
- Summarize shell output in plain English, never dump raw stdout

Operating style (critical):
- Adrian runs a solo autonomous build. He expects agents to act, not ask.
- When he says "kick off hermes", run it. Don't confirm, don't list caveats, don't ask how many units.
- Only pause if something is genuinely ambiguous (e.g. which specific unit to target).
- Never ask questions you can answer yourself from orchestration.json or git.
- No emoji, no tables, no markdown headers in responses — plain short text only.

Available commands (run via shell_exec):
- nohup pnpm hermes:loop > /tmp/hermes-loop.log 2>&1 & echo $!            — start Hermes loop in bg
- pnpm hermes:unit --unit <id>             — run single unit with Hermes
- node scripts/audit-claims.mjs            — check stale claims
- tail -20 /tmp/hermes-loop.log            — check Hermes progress
- kill <pid>                               — stop a loop

Client workspace:
- "pull up lilac", "how's Conrad's project", "lilac status" → use client_status tool with slug "lilac-insure"
- "sync lilac emails", "parse emails for lilac" → use sync_client_emails tool
- Client data lives in clients/<slug>/ — tasks, checklist, retainer, notes, goals

Agent routing:
- T1/T2 mechanical tasks → Hermes (free, local)
- T2/T3 component/schema/validator work → Claude (closed-frontier, sonnet default)
- T4 architecture/planning (e.g. 12n) → Claude/you only

IMPORTANT: Both loops run forever. ALWAYS launch with nohup + & — never foreground. Return the PID to Adrian.

Agent tiers:
- T1/T2 → Hermes (local, mechanical tasks)
- T3 → Qwen (component/schema work)
- T4 → Claude/you (architecture, planning units like 12n)`;

// ── OpenRouter conversation (OpenAI-compatible) ───────────────────────────────

async function askOpenRouter(channelId, userMessage) {
  addToHistory(channelId, 'user', userMessage);
  let messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...getHistory(channelId).map(m => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hirobius.com',
        'X-Title': 'Hirobius HQ Bot',
      },
      body: JSON.stringify({
        model: BOT_MODEL,
        max_tokens: 1024,
        tools: TOOLS_OPENAI,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) break;

    // No tool calls → final response
    if (!msg.tool_calls?.length) {
      const text = msg.content || '';
      addToHistory(channelId, 'assistant', text);
      return text;
    }

    // Execute tool calls
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      let input;
      try { input = JSON.parse(call.function.arguments); } catch { input = {}; }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: executeTool(call.function.name, input),
      });
    }
  }

  return '(No response)';
}

// ── Anthropic direct conversation ─────────────────────────────────────────────

async function askAnthropic(channelId, userMessage) {
  addToHistory(channelId, 'user', userMessage);
  let messages = getHistory(channelId).map(m => ({ role: m.role, content: m.content }));

  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS_ANTHROPIC,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
      addToHistory(channelId, 'assistant', text);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content });
      const results = response.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: executeTool(b.name, b.input) }));
      messages.push({ role: 'user', content: results });
      continue;
    }

    break;
  }

  return '(No response)';
}

// ── Ollama conversation (local, free) ─────────────────────────────────────────

async function askOllama(channelId, userMessage) {
  addToHistory(channelId, 'user', userMessage);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...getHistory(channelId).map(m => ({ role: m.role, content: m.content })),
  ];

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false, tools: TOOLS_OPENAI }),
    });

    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const msg = data.message;
    if (!msg) break;

    if (!msg.tool_calls?.length) {
      const text = msg.content || '';
      addToHistory(channelId, 'assistant', text);
      return text;
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      const args = call.function.arguments;
      const input = typeof args === 'string' ? JSON.parse(args) : (args || {});
      messages.push({ role: 'tool', content: executeTool(call.function.name, input) });
    }
  }

  return '(No response)';
}

// ── Unified ask ───────────────────────────────────────────────────────────────

async function ask(channelId, userMessage) {
  const provider = pickProvider(channelId);
  if (provider === 'anthropic')  return askAnthropic(channelId, userMessage);
  if (provider === 'openrouter') return askOpenRouter(channelId, userMessage);
  return askOllama(channelId, userMessage);
}

// ── Quick command handlers ────────────────────────────────────────────────────

async function cmdAgents(channel) {
  try {
    const lines = ['**Running Agents**', ''];

    const procs = shell(`ps aux | grep -E "(hermes-unit|hermes:loop)" | grep -v grep || true`);
    if (procs.trim()) {
      for (const row of procs.trim().split('\n')) {
        const cols = row.trim().split(/\s+/);
        const pid  = cols[1];
        const cpu  = cols[2];
        const mem  = cols[3];
        const cmd  = cols.slice(10).join(' ').slice(0, 60);
        lines.push(`🟠 Hermes PID \`${pid}\` — CPU ${cpu}% MEM ${mem}% — \`${cmd}\``);
      }
    } else {
      lines.push('No agents running.');
    }

    lines.push('');
    const mem = shell(`free -h | awk '/^Mem:/{print "RAM: " $3 " used / " $2 " total — " $7 " available"}'`);
    lines.push(mem);

    const hermesTail = shell(`tail -3 ${HERMES_LOG} 2>/dev/null || echo "(no hermes log)"`);
    lines.push('', '**Hermes (last 3 lines):**', '```', hermesTail.slice(0, 400), '```');

    await send(channel, lines.join('\n'));
  } catch (e) {
    await send(channel, `Error: ${e.message}`);
  }
}

async function cmdHelp(channel) {
  await send(channel, [
    '**Hirobius HQ Bot**',
    '',
    `Type a task description and the auto-assigner classifies + routes it to a tier (\`${DEFAULT_CLIENT}\` by default).`,
    'Prefix with \`[client-slug]\` to target a different client: \`[the-ranch-foundation] do X\`.',
    'Anything that isn\'t a task falls through to natural-language chat.',
    '',
    '**Quick shortcuts (no API cost):**',
    '`!status` — BACKLOG.md summary by category + git head',
    '`!backlog [filter]` — backlog digest. Filter by category (`portfolio`, `concrete`, `hds`…) or status (`ready`, `blocked`, `parked`, `idea`)',
    '`!next` / `!today` — AI picks top 1-3 ready items focused on portfolio/storefront, with reasoning',
    '`!recent [days]` — BACKLOG.md changes from git log (default last 7 days)',
    '`!agents` — running Hermes processes + memory',
    '`!log hermes [n]` — tail Hermes log',
    '`!shell <cmd>` — raw shell passthrough',
    '`!provider [name]` — show or set AI provider for this channel',
    '`!local` — switch this channel to Ollama (free, local)',
    '`!cloud` — switch this channel to Anthropic (best reasoning)',
    '`!help` — this message',
    '',
    'Start a Discord **thread** for isolated conversation with full context.',
  ].join('\n'));
}

async function cmdProvider(channel, channelId, args) {
  const requested = (args || '').trim().toLowerCase();
  if (!requested) {
    const current = pickProvider(channelId);
    await send(channel, `Provider for this channel: **${describeProvider(current)}**\nUse \`!provider ollama|anthropic|openrouter\` to switch.`);
    return;
  }
  if (!['ollama', 'anthropic', 'openrouter'].includes(requested)) {
    await send(channel, `Unknown provider \`${requested}\`. Try: \`ollama\`, \`anthropic\`, \`openrouter\`.`);
    return;
  }
  if (requested === 'anthropic' && !anthropic) {
    await send(channel, '`anthropic` unavailable — `ANTHROPIC_API_KEY` not configured. Falling back to Ollama for this channel.');
    providerOverrides.set(channelId, 'ollama');
    return;
  }
  if (requested === 'openrouter' && !OPENROUTER_AVAILABLE) {
    await send(channel, '`openrouter` unavailable — `OPENROUTER_API_KEY` not configured. Falling back to Ollama for this channel.');
    providerOverrides.set(channelId, 'ollama');
    return;
  }
  providerOverrides.set(channelId, requested);
  await send(channel, `Provider set for this channel: **${describeProvider(requested)}**`);
}

async function cmdStatus(channel, channelId) {
  try {
    const b = parseBacklog();
    const gitBranch = shell('git rev-parse --abbrev-ref HEAD');
    const gitShort  = shell('git rev-parse --short HEAD');
    const providerLine = channelId ? `_AI provider here: ${describeProvider(pickProvider(channelId))}_` : null;

    const totalOpen = b.items.length;
    const ready     = b.statuses.ready || 0;
    const blocked   = b.statuses.blocked || 0;
    const parked    = b.statuses.parked || 0;
    const ideas     = b.statuses.idea || 0;

    const lines = [
      `**Status** — \`${gitBranch}\` @ \`${gitShort}\``,
      `📋 **${totalOpen}** open items in BACKLOG.md`,
      `🟢 ready: **${ready}**  🔴 blocked: **${blocked}**  ⚪ parked: **${parked}**  💡 idea: **${ideas}**`,
    ];
    if (providerLine) lines.push('', providerLine);

    // Per-category headline + top ready item
    const cats = Object.entries(b.categories).sort((a, b) => b[1].length - a[1].length);
    if (cats.length > 0) {
      lines.push('', '**By category:**');
      for (const [cat, arr] of cats) {
        const readyHere = arr.filter(i => i.status === 'ready');
        const summary = `${arr.length} (${readyHere.length} ready)`;
        const top = readyHere[0];
        const topLine = top ? ` — next: \`${top.id}\`` : '';
        lines.push(`• **${cat}** — ${summary}${topLine}`);
      }
    }

    lines.push('', '_Use_ `!backlog <category>` _to drill into a section, or_ `!backlog ready` _for actionable items._');
    await send(channel, lines.join('\n'));
  } catch (e) {
    await send(channel, `Error reading BACKLOG.md: ${e.message}`);
  }
}

// ── !backlog [filter] ─────────────────────────────────────────────────────────
// Filter is optional and can be a category (fuzzy) or a status (ready/blocked/etc.)
async function cmdBacklog(channel, args) {
  try {
    const b = parseBacklog();
    if (b.items.length === 0) {
      await send(channel, 'BACKLOG.md is empty or unreadable.');
      return;
    }
    const filter = (args || '').trim().toLowerCase();
    const KNOWN_STATUSES = ['ready', 'blocked', 'parked', 'needs-grilling', 'idea'];

    // No arg → show top 3 ready items per category (actionable digest)
    if (!filter) {
      const lines = [`**Backlog digest** — ${b.items.length} open items total`];
      const cats = Object.entries(b.categories).sort((a, b) => b[1].length - a[1].length);
      for (const [cat, arr] of cats) {
        const ready = arr.filter(i => i.status === 'ready');
        if (ready.length === 0) continue;
        lines.push('', `**${cat}** (${ready.length} ready)`);
        for (const it of ready.slice(0, 3)) {
          lines.push(`${statusEmoji(it.status)} \`${it.id}\` — ${it.title.slice(0, 80)}`);
        }
        if (ready.length > 3) lines.push(`_…+${ready.length - 3} more in this category_`);
      }
      lines.push('', '_`!backlog blocked` for blocked items · `!backlog <category>` to drill in_');
      await send(channel, lines.join('\n'));
      return;
    }

    // Filter by status if it matches a known one
    if (KNOWN_STATUSES.includes(filter)) {
      const matches = b.items.filter(i => i.status === filter);
      const lines = [`**Backlog: ${matches.length} item(s) with status \`${filter}\`**`];
      if (matches.length === 0) {
        lines.push('_None._');
      } else {
        // Group by category for readability
        const byCat = {};
        matches.forEach(i => (byCat[i.category] = byCat[i.category] || []).push(i));
        for (const [cat, arr] of Object.entries(byCat)) {
          lines.push('', `**${cat}** (${arr.length})`);
          for (const it of arr.slice(0, 8)) {
            lines.push(`${statusEmoji(it.status)} \`${it.id}\` — ${it.title.slice(0, 80)}`);
          }
          if (arr.length > 8) lines.push(`_…+${arr.length - 8} more_`);
        }
      }
      await send(channel, lines.join('\n').slice(0, 1900));
      return;
    }

    // Otherwise treat as category name (fuzzy)
    const cat = resolveCategory(filter, b.categories);
    if (!cat) {
      await send(channel,
        `No category matched \`${filter}\`. Try: ${Object.keys(b.categories).map(c => `\`${c.split(' ')[0].toLowerCase()}\``).join(', ')}\n` +
        `Or filter by status: \`!backlog ready\` · \`!backlog blocked\` · \`!backlog parked\` · \`!backlog idea\``);
      return;
    }
    const arr = b.categories[cat];
    const counts = arr.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
    const countLine = Object.entries(counts).map(([s, n]) => `${statusEmoji(s)} ${s}: ${n}`).join(' · ');
    const lines = [`**${cat}** (${arr.length} items) — ${countLine}`];
    // Sort: ready → blocked → needs-grilling → parked → idea
    const sortOrder = { ready: 0, blocked: 1, 'needs-grilling': 2, parked: 3, idea: 4 };
    const sorted = [...arr].sort((a, b) => (sortOrder[a.status] ?? 99) - (sortOrder[b.status] ?? 99));
    for (const it of sorted.slice(0, 15)) {
      lines.push(`${statusEmoji(it.status)} \`${it.id}\` — ${it.title.slice(0, 80)}`);
    }
    if (sorted.length > 15) lines.push(`_…+${sorted.length - 15} more in this category_`);
    await send(channel, lines.join('\n').slice(0, 1900));
  } catch (e) {
    await send(channel, `Error reading BACKLOG.md: ${e.message}`);
  }
}

// ── One-shot AI helper (no history, no tools) ─────────────────────────────────
// Used by !next so the recommendation prompt doesn't pollute channel chat history.
async function askOneShot(channelId, systemPrompt, userMessage) {
  const provider = pickProvider(channelId);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  if (provider === 'anthropic' && anthropic) {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6-20251010',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return r.content?.[0]?.text || '(no response)';
  }

  if (provider === 'openrouter' && OPENROUTER_AVAILABLE) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hirobius.com',
        'X-Title': 'Hirobius HQ Bot',
      },
      body: JSON.stringify({ model: BOT_MODEL, max_tokens: 1024, messages }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '(no response)';
  }

  // Default: Ollama
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.message?.content || '(no response)';
}

// ── !next — AI-recommended top tasks ──────────────────────────────────────────
async function cmdNext(channel, channelId) {
  try {
    const b = parseBacklog();
    const ready = b.items.filter(i => i.status === 'ready');
    if (ready.length === 0) {
      await send(channel, 'No `ready` items in BACKLOG.md. Promote some `idea`/`parked` items first.');
      return;
    }

    const gitBranch = shell('git rev-parse --abbrev-ref HEAD');
    const recentCommits = shell('git log -5 --pretty=format:"%h %s"');
    const today = new Date().toISOString().slice(0, 10);

    const readyList = ready.map(i => `- [${i.category}] \`${i.id}\` — ${i.title}`).join('\n');

    const systemPrompt = [
      'You are a focused execution coach for Adrian, a solo design engineer.',
      'Adrian is currently focused on adrianmilsap.com (his portfolio) and apps/concrete (Hirobius Studio storefront).',
      'Given a list of READY backlog items, recommend the top 1-3 items he should do TODAY.',
      'Prioritize items that:',
      ' 1. Unblock the active portfolio deploy or storefront launch',
      ' 2. Are short enough to ship in one focused session (<2 hours)',
      ' 3. Have visible/proof-able outcomes (real content, real deploy, real screenshot)',
      'Avoid recommending: infrastructure refactors, HDS deep work, ops/agent tooling, anything that needs >1 session.',
      'Output format (markdown, max 200 words total):',
      '**Top picks for today:**',
      '1. `<id>` — <one sentence on WHY this is the move now>',
      '2. ...',
      '3. ...',
      '',
      '_Brief reasoning paragraph (2-3 sentences) explaining the overall focus._',
    ].join('\n');

    const userMessage = [
      `Today: ${today}`,
      `Branch: ${gitBranch}`,
      `Recent commits:\n${recentCommits}`,
      '',
      `READY items (${ready.length}):`,
      readyList,
    ].join('\n');

    await channel.sendTyping?.();
    const response = await askOneShot(channelId, systemPrompt, userMessage);
    await send(channel, response);
  } catch (e) {
    await send(channel, `Error generating recommendation: ${e.message}`);
  }
}

// ── !recent — BACKLOG.md changes in last 7 days ───────────────────────────────
async function cmdRecent(channel, args) {
  try {
    const days = parseInt((args || '').trim()) || 7;
    const since = `${days} days ago`;
    const log = shell(`git log --since="${since}" --pretty=format:"%h|%ad|%s" --date=short -- BACKLOG.md`);
    if (!log) {
      await send(channel, `No BACKLOG.md commits in the last ${days} days.`);
      return;
    }

    const commits = log.split('\n').filter(Boolean).map(line => {
      const [hash, date, ...rest] = line.split('|');
      return { hash, date, subject: rest.join('|') };
    });

    // For each commit, get the diff and pull out added / deleted backlog-item lines.
    const lines = [`**BACKLOG.md changes (last ${days}d)** — ${commits.length} commit(s)`];
    for (const c of commits.slice(0, 10)) {
      const diff = shell(`git show --pretty=format: --no-color ${c.hash} -- BACKLOG.md`);
      const added = diff.split('\n').filter(l => /^\+- `/.test(l)).map(l => l.slice(1));
      const removed = diff.split('\n').filter(l => /^-- `/.test(l)).map(l => l.slice(1));
      lines.push('', `\`${c.hash}\` ${c.date} — ${c.subject.slice(0, 70)}`);
      if (added.length > 0) {
        lines.push(`  + ${added.length} added:`);
        for (const a of added.slice(0, 3)) lines.push(`     ${a.slice(0, 90)}`);
        if (added.length > 3) lines.push(`     …+${added.length - 3} more`);
      }
      if (removed.length > 0) {
        lines.push(`  − ${removed.length} removed (shipped or dropped):`);
        for (const r of removed.slice(0, 3)) lines.push(`     ${r.slice(0, 90)}`);
        if (removed.length > 3) lines.push(`     …+${removed.length - 3} more`);
      }
    }
    if (commits.length > 10) lines.push('', `_…+${commits.length - 10} older commits_`);
    await send(channel, lines.join('\n').slice(0, 1900));
  } catch (e) {
    await send(channel, `Error reading git log: ${e.message}`);
  }
}

async function cmdShell(channel, args) {
  if (!args.trim()) { await send(channel, 'Usage: `!shell <command>`'); return; }
  try {
    const out = shell(args) || '(no output)';
    await send(channel, '```\n' + out.slice(0, 1800) + '\n```');
  } catch (e) {
    const stderr = e.stderr?.toString().trim() || e.message;
    await send(channel, '```\nERROR:\n' + stderr.slice(0, 1800) + '\n```');
  }
}

// ── Auto-assigner integration ─────────────────────────────────────────────────
// Non-! messages route to scripts/auto-assigner.mjs first. Exit 0 → reply with
// routing decision. Exit 2 (not-a-task) → fall through to the NL-AI path so
// chitchat still works. Exit 3 (ambiguous) → ask for clarification. The bot
// stays a thin transport — all classification + tier routing logic lives in
// auto-assigner.mjs so Telegram/CLI/Discord share one brain.

function parseClientPrefix(text) {
  const match = text.match(/^\[([a-z0-9-]+)\]\s*(.+)$/i);
  if (match) return { client: match[1], rest: match[2] };
  return { client: DEFAULT_CLIENT, rest: text };
}

function runAssigner(text, clientSlug) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/auto-assigner.mjs', '--client', clientSlug], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      let result = null;
      try { result = JSON.parse(stdout); } catch { /* result stays null */ }
      resolve({ code, result, stderr });
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

function formatRoutingDecision(result, clientSlug) {
  const { taskId, tier, model, effort, costCeiling, rationale, createdNew } = result;
  const created = createdNew ? '🆕 created' : '🔄 re-routed';
  const cost    = costCeiling > 0 ? `$${costCeiling.toFixed(4)} ceiling` : 'free (local)';
  return [
    `${created} \`${taskId}\` → \`${model}\` (${tier}, ${effort})`,
    `${cost} · ${rationale}`,
    `→ /ops/clients/${clientSlug}`,
  ].join('\n');
}

async function cmdLog(channel, args) {
  const parts = args.trim().split(/\s+/);
  let logFile = LOG_FILE;
  let n = 20;
  for (const p of parts) {
    if (p === 'hermes') { logFile = HERMES_LOG; continue; }
    const num = parseInt(p, 10);
    if (!isNaN(num)) n = num;
  }
  try {
    const out = shell(`tail -${n} ${logFile} 2>/dev/null || echo "(log empty)"`);
    await send(channel, '```\n' + out.slice(0, 1800) + '\n```');
  } catch {
    await send(channel, `(no log at ${logFile})`);
  }
}

// ── Discord client ────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  // Without Channel + Message partials, discord.js silently drops
  // messageCreate events from uncached DM channels — which is exactly the
  // path mobile users hit (DMing the bot rather than mentioning in a
  // channel). With these partials, DMs from any device fire the handler.
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', () => {
  console.log(`[bot] Online as ${client.user?.tag}`);
  console.log(`[bot] Default provider: ${describeProvider(BOT_PROVIDER_DEFAULT)}`);
  console.log(`[bot] Available: ollama=yes anthropic=${anthropic ? 'yes' : 'no'} openrouter=${OPENROUTER_AVAILABLE ? 'yes' : 'no'}`);
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  if (msg.author.id !== OWNER_ID) return;
  if (GUILD_ID && msg.guildId && msg.guildId !== GUILD_ID) return;

  const text = msg.content.trim();
  if (!text) return;

  // Context key: thread ID if in a thread, else channel ID
  const ctxKey = msg.channel.isThread?.() ? msg.channelId : `${msg.channelId}-fresh`;

  console.log(`[bot] <${msg.author.username}> ${text.slice(0, 80)}`);

  // ! shortcuts — fast, no AI
  if (text.startsWith('!')) {
    const [cmd, ...rest] = text.slice(1).split(' ');
    const args = rest.join(' ');
    try {
      switch (cmd.toLowerCase()) {
        case 'help':    await cmdHelp(msg.channel);          return;
        case 'status':  await cmdStatus(msg.channel, msg.channelId); return;
        case 'backlog': await cmdBacklog(msg.channel, args);  return;
        case 'next':    await cmdNext(msg.channel, msg.channelId); return;
        case 'today':   await cmdNext(msg.channel, msg.channelId); return;
        case 'recent':  await cmdRecent(msg.channel, args);   return;
        case 'agents': await cmdAgents(msg.channel);        return;
        case 'shell':  await cmdShell(msg.channel, args);   return;
        case 'log':    await cmdLog(msg.channel, args);     return;
        case 'provider': await cmdProvider(msg.channel, msg.channelId, args); return;
        case 'local':    await cmdProvider(msg.channel, msg.channelId, 'ollama'); return;
        case 'cloud':    await cmdProvider(msg.channel, msg.channelId, 'anthropic'); return;
        default:
          // Unknown ! command → fall through to Claude
          break;
      }
    } catch (e) {
      await send(msg.channel, `Error: ${e.message}`);
      return;
    }
  }

  // Auto-assigner first — classify + route as a task if applicable.
  // Falls through to NL-AI for not-task / runtime-error paths.
  try {
    await msg.channel.sendTyping();
    const { client: clientSlug, rest } = parseClientPrefix(text);
    const { code, result, stderr } = await runAssigner(rest, clientSlug);

    if (code === 0 && result?.verdict === 'task') {
      await send(msg.channel, formatRoutingDecision(result, clientSlug));
      return;
    }
    if (code === 3 && result?.reason) {
      await send(msg.channel, `🤔 Ambiguous: ${result.reason}\nClarify or rephrase.`);
      return;
    }
    if (code === 1) {
      // assigner runtime error — log and fall through to NL-AI
      console.warn('[bot] assigner runtime error:', stderr.trim().slice(0, 300));
    }
    // code 2 (not-a-task) or unparsed result → fall through to NL-AI
  } catch (e) {
    console.warn('[bot] assigner spawn failed, falling through to NL-AI:', e.message);
  }

  // Natural language fallback → AI
  try {
    const reply = await ask(ctxKey, text);
    await send(msg.channel, reply);
  } catch (e) {
    console.error('[bot] AI error:', e.message);
    await send(msg.channel, `AI error: ${e.message}`);
  }
});

client.login(BOT_TOKEN);
