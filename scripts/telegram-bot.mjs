#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/telegram-bot.mjs
 *
 * Telegram adapter for the Hirobius HQ auto-assigner. Mirrors
 * scripts/discord-bot.mjs message routing — same backend, different
 * transport. Both can run side-by-side; both write to the same
 * docs/ai/routing-log.jsonl audit trail.
 *
 * Owner-only. Drops every message whose chat.id != TELEGRAM_OWNER_ID
 * (cheap multi-tenant guard for a personal bot).
 *
 * Required env vars in .env.local:
 *   TELEGRAM_BOT_TOKEN=<bot token from @BotFather>
 *   TELEGRAM_OWNER_ID=<your Telegram user ID — message @userinfobot to find it>
 *   DISCORD_DEFAULT_CLIENT=lilac-insure   (shared default; same var as Discord)
 *
 * Run:
 *   pnpm telegram   (or node scripts/telegram-bot.mjs)
 *
 * Implementation notes:
 *   - Uses long-polling via getUpdates with 25-second timeout. No webhooks
 *     (those need a public HTTPS endpoint). Polling is fine on a VPS.
 *   - No telegraf / node-telegram-bot-api dep — raw fetch keeps the surface
 *     small and the runtime sandbox-safe.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Auto-load .env.local (mirrors discord-bot.mjs pattern)
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID       = process.env.TELEGRAM_OWNER_ID;
const DEFAULT_CLIENT = process.env.DISCORD_DEFAULT_CLIENT || 'lilac-insure';

if (!BOT_TOKEN) { console.error('[tg] TELEGRAM_BOT_TOKEN not set in .env.local'); process.exit(1); }
if (!OWNER_ID)  { console.error('[tg] TELEGRAM_OWNER_ID not set in .env.local');  process.exit(1); }

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const POLL_TIMEOUT = 25;  // seconds — Telegram supports up to 50

// ── Auto-assigner integration ─────────────────────────────────────────────────

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

// ── Telegram HTTP wrappers ────────────────────────────────────────────────────

async function tg(method, body) {
  const response = await fetch(`${API}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(`telegram ${method} failed: ${data.description}`);
  return data.result;
}

async function sendMessage(chatId, text) {
  // Telegram messages cap at 4096 chars. Chunk for safety.
  for (let i = 0; i < text.length; i += 4000) {
    await tg('sendMessage', {
      chat_id:    chatId,
      text:       text.slice(i, i + 4000),
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }
}

async function sendTyping(chatId) {
  try { await tg('sendChatAction', { chat_id: chatId, action: 'typing' }); } catch { /* non-fatal */ }
}

// ── Main poll loop ────────────────────────────────────────────────────────────

async function handleMessage(message) {
  const chatId = message.chat?.id;
  const fromId = String(message.from?.id ?? '');
  const text   = (message.text ?? '').trim();
  if (!chatId || !text) return;
  if (fromId !== String(OWNER_ID)) {
    console.log(`[tg] dropped non-owner message from ${fromId}`);
    return;
  }

  console.log(`[tg] <${message.from?.username ?? fromId}> ${text.slice(0, 80)}`);

  // !help shortcut — mirror Discord cmdHelp content
  if (text === '/start' || text === '/help' || text === '!help') {
    await sendMessage(chatId, [
      '*Hirobius HQ — Telegram*',
      '',
      `Type a task and the auto-assigner classifies + routes it to a tier (\`${DEFAULT_CLIENT}\` by default).`,
      'Prefix with `[client-slug]` to target a different client: `[the-ranch-foundation] do X`.',
      'Routing decisions land in \`/ops\` Sessions feed.',
    ].join('\n'));
    return;
  }

  await sendTyping(chatId);

  try {
    const { client: clientSlug, rest } = parseClientPrefix(text);
    const { code, result, stderr } = await runAssigner(rest, clientSlug);

    if (code === 0 && result?.verdict === 'task') {
      await sendMessage(chatId, formatRoutingDecision(result, clientSlug));
      return;
    }
    if (code === 2) {
      await sendMessage(chatId, '🗨️ Logged as not-a-task (memory note, not routed). Use `/help` for syntax.');
      return;
    }
    if (code === 3 && result?.reason) {
      await sendMessage(chatId, `🤔 Ambiguous: ${result.reason}\nClarify or rephrase.`);
      return;
    }
    if (code === 1) {
      await sendMessage(chatId, `⚠️ Assigner runtime error:\n\`\`\`\n${(stderr || 'unknown').slice(0, 500)}\n\`\`\``);
      return;
    }
    await sendMessage(chatId, `(unhandled exit code ${code})`);
  } catch (error) {
    console.error('[tg] handler error:', error.message);
    await sendMessage(chatId, `Error: ${error.message}`);
  }
}

async function main() {
  console.log(`[tg] Online — owner=${OWNER_ID}, default-client=${DEFAULT_CLIENT}`);
  let offset = 0;
  while (true) {
    try {
      const updates = await tg('getUpdates', { offset, timeout: POLL_TIMEOUT, allowed_updates: ['message'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) {
          await handleMessage(update.message);
        }
      }
    } catch (error) {
      console.error('[tg] poll error:', error.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

main().catch((error) => {
  console.error('[tg] fatal:', error);
  process.exit(1);
});
