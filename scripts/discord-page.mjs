#!/usr/bin/env node
/**
 * discord-page.mjs — page DISCORD_WEBHOOK_URL from a workflow step, loudly.
 *
 * A scheduled workflow that fails notifies exactly one account by email: whoever
 * last touched the cron line. That is a weak alert, so the failing step also
 * pages Discord. This is the script that does it.
 *
 * Why a script and not four lines of inline `curl`: the inline version was
 * `curl -sS ... || echo "notify failed"`, and `curl` without `--fail` exits 0 on
 * HTTP 401/404. A revoked webhook was therefore reported as a successful page —
 * the failure mode the page exists to cover. Delivery is checked here on the
 * response status, through the same `postToDiscord` seam every other notifier in
 * this repo already uses (`lib/ops/notify.mjs`), rather than re-invented per
 * workflow. Node builtins only, so a workflow needs no install step.
 *
 * Best-effort by contract: this ALWAYS exits 0. The page supplements the
 * failed-run email; it must never turn a red run green, and never turn a green
 * run red. Every failure instead prints a notice that names DISCORD_WEBHOOK_URL
 * and the exact command that fixes it (standing rule: a secret-backed feature
 * fails loud and actionable, naming the variable AND the fix).
 *
 * The webhook URL is itself the credential and workflow logs on a public repo
 * are public, so it is redacted out of anything printed.
 *
 * Usage:
 *   node scripts/discord-page.mjs --title "<one line>" \
 *     [--url <run url>] [--detail <text> | --detail-file <path>]
 *
 * Env:
 *   DISCORD_WEBHOOK_URL  the webhook to page (a repo Actions secret)
 *   GITHUB_REPOSITORY    only used to print the exact `gh secret set` fix
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postToDiscord } from '../lib/ops/notify.mjs';

/** Discord's own content ceiling is 2000; leave room for title, URL and fences. */
const DETAIL_CAP = 900;

/**
 * @param {string[]} argv raw args after the script name
 * @returns {{ title: string, url: string, detail: string, detailFile: string }}
 */
export function parseArgs(argv) {
  const o = { title: '', url: '', detail: '', detailFile: '' };
  for (let i = 0; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--title':
        o.title = argv[++i] ?? '';
        break;
      case '--url':
        o.url = argv[++i] ?? '';
        break;
      case '--detail':
        o.detail = argv[++i] ?? '';
        break;
      case '--detail-file':
        o.detailFile = argv[++i] ?? '';
        break;
      default:
        throw new Error(`unknown flag: ${argv[i]}`);
    }
  }
  if (!o.title.trim()) throw new Error('--title is required');
  return o;
}

/**
 * Reads the detail block, preferring an explicit `--detail`. A missing or empty
 * file is not an error: the step it came from is the one that just failed, and
 * "it printed nothing" is itself the useful fact to relay.
 */
export function readDetail({ detail, detailFile }) {
  if (detail.trim()) return detail.slice(0, DETAIL_CAP);
  if (detailFile) {
    try {
      const text = readFileSync(detailFile, 'utf8').trim();
      if (text) return text.slice(0, DETAIL_CAP);
    } catch {
      /* fall through to the no-output note */
    }
    return '(the step produced no output — it probably crashed before running)';
  }
  return '';
}

/** One Discord message: title line, run URL, then the fenced detail. */
export function buildContent({ title, url, detail }) {
  let content = title;
  if (url) content += `\n${url}`;
  if (detail) content += `\n\`\`\`\n${detail}\n\`\`\``;
  return content;
}

/** Keeps the webhook (a credential) out of any line this script prints. */
export function redact(text, secret) {
  if (!secret) return text;
  return text.split(secret).join('<DISCORD_WEBHOOK_URL>');
}

/**
 * @param {string[]} argv
 * @param {NodeJS.ProcessEnv} env
 * @param {{ log: (s: string) => void, err: (s: string) => void }} io
 * @returns {Promise<0>} always — see the best-effort contract above.
 */
export async function run(argv, env, io) {
  const repo = env.GITHUB_REPOSITORY || '<owner>/<repo>';
  const fix = `Fix: gh secret set DISCORD_WEBHOOK_URL --repo ${repo}`;
  const webhookUrl = (env.DISCORD_WEBHOOK_URL || '').trim();

  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.err(`discord-page: ${e.message} — nothing was paged.`);
    return 0;
  }

  if (!webhookUrl) {
    io.err(
      `discord-page: DISCORD_WEBHOOK_URL is not set on ${repo} — nothing was paged, ` +
        `so the failed-run email is the only alert.\n  ${fix}`,
    );
    return 0;
  }

  const content = buildContent({ ...args, detail: readDetail(args) });
  const { sent, reason } = await postToDiscord(content, { webhookUrl });

  if (sent) {
    io.log('discord-page: paged Discord.');
    return 0;
  }

  io.err(
    `discord-page: DISCORD_WEBHOOK_URL is set on ${repo} but the page did NOT deliver ` +
      `(${redact(reason ?? 'unknown error', webhookUrl)}) — the webhook is dead, revoked, ` +
      `or points at a deleted channel, so the failed-run email is the only alert.\n` +
      `  ${fix}  (create a replacement webhook in the Discord channel first)`,
  );
  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2), process.env, {
    log: (s) => process.stdout.write(`${s}\n`),
    err: (s) => process.stderr.write(`${s}\n`),
  }).then((code) => process.exit(code));
}
