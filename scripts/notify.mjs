#!/usr/bin/env node
/**
 * scripts/notify.mjs — post one fleet event (#41 Slice 4, observability layer).
 *
 * Thin CLI over lib/ops/notify.mjs::notifyEvent. Manual/testing use — the
 * dispatcher/other scripts call `notifyEvent` directly rather than shelling
 * out to this. The timestamp is stamped here at post-time (`new Date()` is
 * fine in a normal one-shot CLI; only workflow scripts that must stay
 * deterministic ban it).
 *
 * Usage:
 *   node scripts/notify.mjs --kind <k> --title "<t>" \
 *     [--detail "<d>"] [--url <u>] [--task <t>]
 *
 * Required:
 *   --kind      dispatched | completed | approval_waiting | deploy_error | blocked
 *   --title     <=140 chars, one line, what happened
 *
 * Optional:
 *   --detail    longer free-text context
 *   --url       link back to the source (session, deployment, PR)
 *   --task      issue ref / task label
 *   --help      print this usage and exit 0
 *
 * Examples:
 *   node scripts/notify.mjs --kind completed --title "Fleet Slice 4 shipped" --task "#41"
 */

import { notifyEvent, EVENT_KINDS } from '../lib/ops/notify.mjs';

function parseArgs(argv) {
  const o = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--kind':
        o.kind = argv[++i];
        break;
      case '--title':
        o.title = argv[++i];
        break;
      case '--detail':
        o.detail = argv[++i];
        break;
      case '--url':
        o.url = argv[++i];
        break;
      case '--task':
        o.task = argv[++i];
        break;
      case '--help':
      case '-h':
        o.help = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    `scripts/notify.mjs — post one fleet event (#41 Slice 4)\n\n` +
      `Usage:\n` +
      `  node scripts/notify.mjs --kind <k> --title "<t>" \\\n` +
      `    [--detail "<d>"] [--url <u>] [--task <t>]\n\n` +
      `Required: --kind --title\n` +
      `  --kind must be one of: ${EVENT_KINDS.join(' | ')}\n` +
      `Optional: --detail --url --task --help\n\n` +
      `Appends one line to docs/ops/events.jsonl and posts to DISCORD_WEBHOOK_URL\n` +
      `if set (fail-soft — a webhook failure never blocks the append). The /ops\n` +
      `Fleet timeline picks the event up on next build.\n`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const missing = ['kind', 'title'].filter((f) => !args[f]);
  if (missing.length > 0) {
    console.error(`Missing required flag(s): ${missing.map((f) => `--${f}`).join(', ')}\n`);
    printHelp();
    process.exit(1);
  }

  const { appended, discord } = await notifyEvent({
    ts: new Date().toISOString(),
    kind: args.kind,
    title: args.title,
    detail: args.detail,
    url: args.url,
    task: args.task,
  });

  console.log(`Logged event: ${appended.ts} · ${appended.kind} — ${appended.title}`);
  if (discord.sent) console.log('Posted to Discord.');
  else console.log(`Discord delivery skipped: ${discord.reason}`);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
