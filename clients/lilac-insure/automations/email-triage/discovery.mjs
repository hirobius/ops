#!/usr/bin/env node
/**
 * email-triage discovery runner — Pattern A.
 *
 * Runs structured discovery questions against an inbox window, via the LLM
 * adapter the customer configured. Output goes to
 * clients/lilac-insure/inbox-discovery-results/<questionId>-<timestamp>.json.
 *
 * Modes:
 *   --probe-llm                       Probe the configured LLM adapter.
 *   --probe-graph                     Probe Microsoft Graph (delegates to live-graph.mjs --auth-check).
 *   --list-questions                  Print every question id + label.
 *   --question <id> --from-fixture <path>
 *                                     Run one question against a fixture file.
 *   --question <id> --from-graph [N]  Run one question against the latest N
 *                                     mailbox messages (default 50).
 *
 * Privacy: this script reads message metadata and short previews. It does NOT
 * persist message bodies. The LLM adapter receives only the data passed in;
 * the result is the only thing written to disk (in inbox-discovery-results/).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootConfig } from '../_shared/config-loader.mjs';
import { getLlmAdapter } from '../_shared/llm/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const QUESTIONS_PATH = path.join(HERE, 'discovery-questions.json');
const RESULTS_DIR = path.resolve(HERE, '..', '..', 'inbox-discovery-results');
const ENV_FILE = path.join(REPO_ROOT, '.env.local');

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has  = (name) => args.includes(name);

function loadQuestions() {
  return JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
}

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function fillTemplate(tpl, ctx) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(ctx[k] ?? ''));
}

function formatMessages(messages) {
  return messages
    .map(m => `id=${m.id}\nreceivedAt=${m.receivedAt}\nfrom=${m.from}\nsubject=${m.subject}\npreview=${(m.preview ?? '').slice(0, 200)}`)
    .join('\n---\n');
}

async function probeLlm() {
  const root = loadRootConfig();
  const adapter = getLlmAdapter(root);
  console.log(`probing llm.provider=${root.llm?.provider} ...`);
  const r = await adapter.probe();
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}

async function probeGraph() {
  const { spawnSync } = await import('node:child_process');
  const liveGraph = path.join(HERE, 'live-graph.mjs');
  const res = spawnSync('node', [liveGraph, '--auth-check'], { stdio: 'inherit' });
  process.exit(res.status ?? 1);
}

async function fetchFromGraph(top) {
  const { spawnSync } = await import('node:child_process');
  const liveGraph = path.join(HERE, 'live-graph.mjs');
  fail('--from-graph: not yet wired into discovery.mjs. Use --from-fixture for now, or run live-graph.mjs --read separately and pipe the JSON through.');
}

async function runQuestion(id, source) {
  const root = loadRootConfig();
  const { questions } = loadQuestions();
  const q = questions.find(x => x.id === id);
  if (!q) fail(`unknown question id: ${id}. Use --list-questions.`);

  const messages = source.messages;
  const data = formatMessages(messages);
  const userPrompt = fillTemplate(q.userPromptTemplate, {
    count: messages.length,
    data,
  });

  const adapter = getLlmAdapter(root);
  console.log(`provider=${adapter.providerName} question=${id} (${q.label})`);
  console.log(`input: ${messages.length} messages, ~${data.length} chars`);

  const start = Date.now();
  const result = await adapter.complete({
    systemPrompt: q.systemPrompt,
    userMessage: userPrompt,
    maxTokens: 2048,
    temperature: 0.1,
    responseFormat: 'json',
  });
  const elapsed = Date.now() - start;

  const out = {
    question: { id: q.id, label: q.label, theme: q.theme, decisionItInforms: q.decisionItInforms },
    runMeta: {
      ranAt: new Date().toISOString(),
      provider: adapter.providerName,
      windowDescription: source.windowDescription ?? 'unspecified',
      messageCount: messages.length,
      elapsedMs: elapsed,
      usage: result.usage,
    },
    response: {
      structured: result.structured ?? null,
      raw: result.structured ? null : result.text,
    },
  };

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(RESULTS_DIR, `${id}-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  console.log(`\nelapsed: ${elapsed}ms`);
  console.log(`tokens:  in=${result.usage.inputTokens ?? '?'} out=${result.usage.outputTokens ?? '?'} cached=${result.usage.cachedTokens ?? 0}`);
  console.log(`saved:   ${path.relative(REPO_ROOT, outPath)}`);
  if (result.structured) {
    console.log('\n--- structured response (preview) ---');
    console.log(JSON.stringify(result.structured, null, 2).slice(0, 800) + '\n...');
  } else {
    console.log('\n--- raw response (no JSON parsed) ---');
    console.log(result.text.slice(0, 800));
  }
}

(async () => {
  if (has('--probe-llm'))   { await probeLlm(); return; }
  if (has('--probe-graph')) { await probeGraph(); return; }

  if (has('--list-questions')) {
    const { questions } = loadQuestions();
    for (const q of questions) console.log(`${q.id.padEnd(4)} ${q.theme.padEnd(12)} ${q.label}`);
    return;
  }

  const id = flag('--question');
  if (!id) {
    console.log('Usage:');
    console.log('  node discovery.mjs --probe-llm');
    console.log('  node discovery.mjs --probe-graph');
    console.log('  node discovery.mjs --list-questions');
    console.log('  node discovery.mjs --question A1 --from-fixture fixtures/discovery-data-sample.json');
    console.log('  node discovery.mjs --question A1 --from-graph [N]');
    process.exit(2);
  }

  const fixture = flag('--from-fixture');
  if (fixture) {
    const source = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    await runQuestion(id, source);
    return;
  }

  if (has('--from-graph')) {
    const N = Number(args[args.indexOf('--from-graph') + 1]) || 50;
    await fetchFromGraph(N);
    return;
  }

  fail('Must supply --from-fixture <path> or --from-graph [N].');
})().catch(e => fail(e.message));
