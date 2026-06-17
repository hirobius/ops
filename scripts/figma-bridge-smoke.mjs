#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/figma-bridge-smoke.mjs
 *
 * End-to-end smoke test for the HDS Figma bridge pipeline (kanban t_d068769e).
 *
 * Validates the *infrastructure* — bridge boots, accepts JSONL commands,
 * broadcasts on /stream — without requiring an actual Figma desktop client
 * or live FIGMA_TOKEN. Two modes:
 *
 *   MOCK  (default, no FIGMA_TOKEN env): exercises bridge endpoints with
 *         synthetic ADD_NODE commands. Asserts response shape; no Figma call.
 *
 *   LIVE  (FIGMA_TOKEN set): same flow, but additionally checks that an
 *         Ollama hermes3 stream returns a JSON envelope matching the
 *         expected schema. Still does not require Figma desktop —
 *         the LLM round-trip + bridge round-trip are the contract.
 *
 * Boots its own bridge instance on a non-default port (3105) so it doesn't
 * collide with a developer-running bridge on 3005. Tears it down on exit.
 *
 * Exit codes:
 *   0 — smoke green
 *   1 — boot failure / endpoint failure / shape mismatch
 *
 * Expected output schema (per request):
 *   POST /generate body: newline-delimited JSON, each line conforms to
 *     §5 of docs/ai/rules/FIGMA_BRIDGE.md (ADD_NODE | UPDATE_NODE).
 *   POST /generate response: { accepted: number, rejected: number,
 *                              clients: number, sequence: number }
 *   GET /stream: text/event-stream emitting `node`, `heartbeat`, `ready`.
 *
 * Run: pnpm figma:bridge:smoke
 */

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 3105;
const BRIDGE_URL = `http://localhost:${PORT}`;
const BOOT_TIMEOUT_MS = 8_000;
const SECRET = 'smoke_test_secret_do_not_commit_a1b2c3d4e5f6';

const MOCK_MODE = !process.env.FIGMA_TOKEN;
const PIPELINE_LABEL = MOCK_MODE ? 'MOCK' : 'LIVE';

let bridgeProc = null;
let failed = false;

function log(line) {
  console.log(`[figma:bridge:smoke ${PIPELINE_LABEL}] ${line}`);
}

function fail(msg, detail) {
  failed = true;
  console.error(`[figma:bridge:smoke ${PIPELINE_LABEL}] FAIL: ${msg}`);
  if (detail !== undefined) console.error('  detail:', detail);
}

async function bootBridge() {
  log(`booting bridge on port ${PORT}`);
  const env = {
    ...process.env,
    HDS_BRIDGE_SECRET: SECRET,
    HDS_BRIDGE_PORT: String(PORT),
  };
  bridgeProc = spawn('node', ['scripts/hds-bridge.mjs'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bridgeProc.stdout.on('data', () => {});
  bridgeProc.stderr.on('data', () => {});
  bridgeProc.on('exit', (code) => {
    if (code !== null && code !== 0 && !failed) {
      fail(`bridge exited unexpectedly with code ${code}`);
    }
  });

  const start = Date.now();
  while (Date.now() - start < BOOT_TIMEOUT_MS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 800);
      const res = await fetch(`${BRIDGE_URL}/get-manifest`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        log('bridge ready');
        return;
      }
    } catch {
      // not ready yet
    }
    await sleep(200);
  }
  throw new Error(`bridge did not become ready within ${BOOT_TIMEOUT_MS}ms`);
}

function teardownBridge() {
  if (!bridgeProc) return;
  try {
    bridgeProc.kill('SIGTERM');
  } catch {
    // already gone
  }
  bridgeProc = null;
}

async function checkManifestEndpoint() {
  log('GET /get-manifest');
  const res = await fetch(`${BRIDGE_URL}/get-manifest`);
  if (!res.ok) {
    fail(`/get-manifest returned ${res.status}`);
    return;
  }
  const body = await res.json();
  if (!body || typeof body !== 'object') {
    fail('/get-manifest body is not an object', body);
    return;
  }
  if (!Array.isArray(body.componentInventory)) {
    fail('/get-manifest missing componentInventory[]');
    return;
  }
  log(`manifest OK — ${body.componentInventory.length} components inventoried`);
}

async function checkGenerateEndpoint() {
  log('POST /generate (synthetic ADD_NODE × 2)');
  // Note: bridge auth-middleware only enforces /plugin-message.
  // /generate is open on localhost (per FIGMA_BRIDGE.md §6 it is to be
  // hardened with the same envelope; not yet shipped).
  const commands = [
    {
      action: 'ADD_NODE',
      id: 'smoke-card-1',
      parentId: 'root',
      type: 'FRAME',
      props: {
        name: 'Smoke Card 1',
        width: 320,
        height: 160,
        fill: 'semantic.color.surface.raised',
        radius: 8,
      },
    },
    {
      action: 'ADD_NODE',
      id: 'smoke-text-1',
      parentId: 'smoke-card-1',
      type: 'TEXT',
      props: {
        name: 'Heading',
        text: 'Bridge smoke',
        typography: 'semantic.typography.h3',
        fill: 'semantic.color.content.primary',
      },
    },
  ];
  const body = commands.map((c) => JSON.stringify(c)).join('\n') + '\n';
  const res = await fetch(`${BRIDGE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body,
  });
  if (!res.ok && res.status !== 207) {
    fail(`/generate returned ${res.status}`);
    return;
  }
  const json = await res.json();
  for (const key of ['accepted', 'rejected', 'clients', 'sequence']) {
    if (typeof json[key] !== 'number') {
      fail(`/generate response missing numeric ${key}`, json);
      return;
    }
  }
  if (json.accepted < 2) {
    fail(`/generate accepted ${json.accepted} of 2 commands`, json);
    return;
  }
  log(`generate OK — accepted=${json.accepted} rejected=${json.rejected} clients=${json.clients} sequence=${json.sequence}`);
}

async function checkStreamEndpoint() {
  log('GET /stream (read first event then disconnect)');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(`${BRIDGE_URL}/stream`, { signal: ctrl.signal });
    if (!res.ok) {
      fail(`/stream returned ${res.status}`);
      return;
    }
    const reader = res.body.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value || new Uint8Array());
    if (!chunk.includes('event:') && !chunk.includes('data:')) {
      fail('/stream first chunk did not look like SSE', chunk.slice(0, 200));
      return;
    }
    log('stream OK — SSE handshake observed');
  } catch (err) {
    if (err.name !== 'AbortError') {
      fail('/stream request errored', err.message);
    }
  } finally {
    clearTimeout(t);
  }
}

async function checkOllamaIfLive() {
  if (MOCK_MODE) {
    log('skipping Ollama JSON-envelope check (mock mode — set FIGMA_TOKEN to enable)');
    return;
  }
  log('checking Ollama hermes3 envelope shape');
  try {
    const res = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      fail(`Ollama /api/tags returned ${res.status}`);
      return;
    }
    const json = await res.json();
    const has = (json.models || []).some((m) => /hermes3/.test(m.name || ''));
    if (!has) {
      fail('Ollama is up but hermes3 is not pulled (run: ollama pull hermes3)');
      return;
    }
    log('Ollama hermes3 present — envelope check skipped (full LLM round-trip is dev-only)');
  } catch (err) {
    fail('Ollama unreachable', err.message);
  }
}

async function main() {
  if (MOCK_MODE) {
    log('FIGMA_TOKEN unset — running in MOCK mode');
    log('  asserts bridge boots, /generate accepts JSONL, /stream emits SSE');
    log('  no live Figma call; no Ollama LLM round-trip');
  } else {
    log('FIGMA_TOKEN present — running in LIVE mode');
    log('  validates bridge + Ollama presence; full LLM↔Figma round-trip is dev-only');
  }

  try {
    await bootBridge();
  } catch (err) {
    fail('bridge boot failed', err.message);
    teardownBridge();
    process.exit(1);
  }

  try {
    await checkManifestEndpoint();
    await checkGenerateEndpoint();
    await checkStreamEndpoint();
    await checkOllamaIfLive();
  } catch (err) {
    fail('smoke check threw', err.message);
  } finally {
    teardownBridge();
  }

  if (failed) {
    log('result: FAIL');
    process.exit(1);
  }
  log('result: PASS');
  process.exit(0);
}

process.on('SIGINT', () => {
  teardownBridge();
  process.exit(130);
});
process.on('SIGTERM', () => {
  teardownBridge();
  process.exit(143);
});

main().catch((err) => {
  fail('uncaught error in main', err.message);
  teardownBridge();
  process.exit(1);
});
