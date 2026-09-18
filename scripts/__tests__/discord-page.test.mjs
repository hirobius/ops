/**
 * Contract for scripts/discord-page.mjs — the best-effort Discord page a
 * scheduled workflow fires when its check step failed.
 *
 * The bug this suite exists to prevent: the first version of this page was
 * inline `curl -sS ... || echo "failed"` in parked-triggers.yml. `curl` without
 * `--fail` exits 0 on HTTP 401/404, so a revoked webhook was reported as a
 * successful page and the `||` branch never ran — the workflow header claimed
 * "a dead webhook prints a notice" while the code printed nothing. That breaks
 * the standing rule that a secret-backed feature must fail loud and actionable,
 * naming the variable AND the fix.
 *
 * Every test here runs the real script against a local HTTP server, so the
 * status-code handling is exercised rather than asserted about.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'discord-page.mjs');

let servers = [];
let dirs = [];
afterEach(async () => {
  for (const server of servers) await new Promise((r) => server.close(r));
  servers = [];
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** Local stand-in for the Discord webhook endpoint. */
async function webhook(status, body = '') {
  const received = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received.push(raw);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(body);
    });
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/api/webhooks/1234/s3cr3t-token`;
  return { url, received };
}

function tmpFile(name, contents) {
  const dir = mkdtempSync(join(tmpdir(), 'discord-page-'));
  dirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, contents, 'utf8');
  return file;
}

/**
 * Async on purpose: the webhook stand-in lives in THIS process, so a blocking
 * `spawnSync` would stall the event loop that has to answer the child's POST —
 * every request would sit unserved until the script's own 8s timeout fired.
 */
function run(args, env = {}) {
  // GIT_* stripped: this suite can run inside a git hook, whose GIT_DIR must
  // not leak into a child process.
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
  return new Promise((done) => {
    execFile(
      'node',
      [SCRIPT, ...args],
      { cwd: ROOT, env: { ...base, GITHUB_REPOSITORY: 'hirobius/ops', ...env }, encoding: 'utf8' },
      (err, stdout, stderr) => done({ code: err?.code ?? 0, out: `${stdout}${stderr}` }),
    );
  });
}

const TITLE = '⏰ Parked trigger fired';

describe('discord-page', () => {
  it('delivers the page and reports it, carrying title, run URL and detail', async () => {
    const { url, received } = await webhook(204);
    const detail = tmpFile(
      'parked.txt',
      'Betting table — next sitting\n  trigger: date 2026-09-17\n',
    );

    const { code, out } = await run(
      [
        '--title',
        TITLE,
        '--url',
        'https://github.com/hirobius/ops/actions/runs/42',
        '--detail-file',
        detail,
      ],
      { DISCORD_WEBHOOK_URL: url },
    );

    expect(code).toBe(0);
    expect(out).toMatch(/paged Discord/i);
    expect(received).toHaveLength(1);
    const content = JSON.parse(received[0]).content;
    expect(content).toContain(TITLE);
    expect(content).toContain('https://github.com/hirobius/ops/actions/runs/42');
    expect(content).toContain('Betting table');
  });

  // The regression. A revoked webhook answers 404 with
  // {"message":"Unknown Webhook","code":10015} — the delivery failed and the
  // only alert left is the single-recipient failed-run email.
  it('names DISCORD_WEBHOOK_URL and the exact fix when the webhook is dead (HTTP 404)', async () => {
    const { url } = await webhook(404, '{"message":"Unknown Webhook","code":10015}');

    const { code, out } = await run(['--title', TITLE], { DISCORD_WEBHOOK_URL: url });

    expect(out).toContain('DISCORD_WEBHOOK_URL');
    expect(out).toContain('404');
    expect(out).toContain('gh secret set DISCORD_WEBHOOK_URL --repo hirobius/ops');
    // Best-effort: the page must never turn a red run green or a green one red.
    expect(code).toBe(0);
  });

  it('names the same variable and fix when the secret is not set at all, and posts nothing', async () => {
    const { url, received } = await webhook(204);

    const { code, out } = await run(['--title', TITLE], { DISCORD_WEBHOOK_URL: '' });

    expect(code).toBe(0);
    expect(out).toContain('DISCORD_WEBHOOK_URL');
    expect(out).toContain('gh secret set DISCORD_WEBHOOK_URL --repo hirobius/ops');
    expect(received).toHaveLength(0);
    expect(url).toBeTruthy();
  });

  // Workflow logs are public on a public repo. Whatever Discord echoes back,
  // the webhook (which is itself the credential) must never reach the log.
  it('never prints the webhook URL, even when the response body quotes it', async () => {
    const { url } = await webhook(400, '');
    const server = servers[servers.length - 1];
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `bad webhook ${url}` }));
    });

    const { code, out } = await run(['--title', TITLE], { DISCORD_WEBHOOK_URL: url });

    expect(code).toBe(0);
    expect(out).not.toContain('s3cr3t-token');
    expect(out).toContain('DISCORD_WEBHOOK_URL');
  });

  it('says so plainly when the failing step produced no detail to relay', async () => {
    const { url, received } = await webhook(204);

    const { code, out } = await run(
      ['--title', TITLE, '--detail-file', join(tmpdir(), 'no-such-parked.txt')],
      {
        DISCORD_WEBHOOK_URL: url,
      },
    );

    expect(code).toBe(0);
    expect(out).toMatch(/paged Discord/i);
    expect(JSON.parse(received[0]).content).toMatch(/no output/i);
  });
});
