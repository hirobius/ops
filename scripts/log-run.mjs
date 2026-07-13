#!/usr/bin/env node
/**
 * scripts/log-run.mjs — post a one-line recap for an autonomous agent/session
 * run (#8, run-log half; Slice 2).
 *
 * Thin CLI over lib/ops/run-log.mjs::appendRun. Any session/agent runs this
 * once before ending so the /ops Runs panel shows it — nothing runs silent.
 * The timestamp is stamped here at post-time (`Date.now()`/`new Date()` are
 * fine in a normal script; only workflow scripts that must stay
 * deterministic ban them — this is a one-shot CLI, not a workflow script).
 *
 * Usage:
 *   node scripts/log-run.mjs --actor <a> --outcome <o> --summary "<s>" \
 *     [--task <t>] [--model <m>] [--tier <t>] [--tokens <n>] [--url <u>]
 *
 * Required:
 *   --actor     who ran it, e.g. claude-subagent | claude
 *   --outcome   e.g. shipped | blocked | no-op
 *   --summary   <=140 chars, one line, what happened
 *
 * Optional:
 *   --task      issue ref / task label
 *   --model     model id/tier label
 *   --tier      dispatch tier label
 *   --tokens    token count for the run
 *   --url       session_url — link back to the originating session
 *   --help      print this usage and exit 0
 *
 * Examples:
 *   node scripts/log-run.mjs --actor claude-subagent --outcome shipped \
 *     --summary "Fixed the flaky retry test in leads.test.mjs" --task "#42"
 */

import { appendRun } from '../lib/ops/run-log.mjs';

function parseArgs(argv) {
  const o = { help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--actor':
        o.actor = argv[++i];
        break;
      case '--outcome':
        o.outcome = argv[++i];
        break;
      case '--summary':
        o.summary = argv[++i];
        break;
      case '--task':
        o.task = argv[++i];
        break;
      case '--model':
        o.model = argv[++i];
        break;
      case '--tier':
        o.tier = argv[++i];
        break;
      case '--tokens':
        o.tokens = argv[++i];
        break;
      case '--url':
        o.session_url = argv[++i];
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
    `scripts/log-run.mjs — post a one-line autonomous-run recap (#8 Slice 2)\n\n` +
      `Usage:\n` +
      `  node scripts/log-run.mjs --actor <a> --outcome <o> --summary "<s>" \\\n` +
      `    [--task <t>] [--model <m>] [--tier <t>] [--tokens <n>] [--url <u>]\n\n` +
      `Required: --actor --outcome --summary\n` +
      `Optional: --task --model --tier --tokens --url --help\n\n` +
      `Appends one line to docs/ops/run-log.jsonl; the /ops Runs panel picks it\n` +
      `up on next build.\n`,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const missing = ['actor', 'outcome', 'summary'].filter((f) => !args[f]);
  if (missing.length > 0) {
    console.error(`Missing required flag(s): ${missing.map((f) => `--${f}`).join(', ')}\n`);
    printHelp();
    process.exit(1);
  }

  const row = appendRun({
    ts: new Date().toISOString(),
    actor: args.actor,
    outcome: args.outcome,
    summary: args.summary,
    task: args.task,
    model: args.model,
    tier: args.tier,
    tokens: args.tokens,
    session_url: args.session_url,
  });

  console.log(`Logged run: ${row.ts} · ${row.actor} · ${row.outcome} — ${row.summary}`);
}

main();
