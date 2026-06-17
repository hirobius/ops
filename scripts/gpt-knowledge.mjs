#!/usr/bin/env node
/**
 * scripts/gpt-knowledge.mjs
 *
 * Ingests ChatGPT export zips (already extracted to ~/hirobius-knowledge-raw/)
 * into the three-pillar knowledge base under docs/knowledge/.
 *
 * STUB STATUS (2026-05-04):
 *   - Rule-based classifier only (scripts/lib/knowledge-classify.mjs)
 *   - No LLM summarization yet — full transcript is written; summary is empty
 *   - Gemini parser not yet built; this script is the GPT-side adapter
 *
 * Usage:
 *   node scripts/gpt-knowledge.mjs                    # dry-run, prints classification report
 *   node scripts/gpt-knowledge.mjs --write            # actually writes markdown files
 *   node scripts/gpt-knowledge.mjs --export A         # only export A (default: both)
 *   node scripts/gpt-knowledge.mjs --since 2025-01-01 # date filter (uses create_time)
 *   node scripts/gpt-knowledge.mjs --review           # write a review CSV without filling pillars
 *
 * Input layout (raw exports kept OUTSIDE the repo):
 *   ~/hirobius-knowledge-raw/gpt-export-A/conversations-{000,001}.json
 *   ~/hirobius-knowledge-raw/gpt-export-B/conversations-{000,001}.json
 *
 * Output layout:
 *   docs/knowledge/{build,grow,run,_unclassified}/ai-convos/gpt/<slug>-<id>.md
 *   docs/knowledge/build/clients/<slug>/ai-convos/gpt/<slug>-<id>.md
 *   ~/hirobius-knowledge-raw/reports/gpt-classification.tsv  (review artifact)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { classify, shortId, slugify } from './lib/knowledge-classify.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(os.homedir(), 'hirobius-knowledge-raw');
const REPORTS = path.join(RAW, 'reports');
const KNOWLEDGE = path.join(ROOT, 'docs/knowledge');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, def = null) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : def;
};

const WRITE = flag('--write');
const REVIEW = flag('--review');
const ONLY_EXPORT = opt('--export'); // 'A' | 'B' | null
const SINCE = opt('--since');         // YYYY-MM-DD
const VERBOSE = flag('--verbose') || flag('-v');

const EXPORTS = ['A', 'B']
  .filter((e) => !ONLY_EXPORT || ONLY_EXPORT === e)
  .map((label) => ({
    label,
    dir: path.join(RAW, `gpt-export-${label}`),
  }))
  .filter((e) => fs.existsSync(e.dir));

if (EXPORTS.length === 0) {
  console.error(`[gpt-knowledge] no exports found under ${RAW}/gpt-export-{A,B}`);
  console.error('  expected: conversations-000.json, conversations-001.json');
  process.exit(1);
}

// ── Parse one ChatGPT conversation node tree into a linear message list ─────

function linearizeMessages(conv) {
  const mapping = conv.mapping || {};
  // Some exports don't include create_time on every node; fall back to insertion order.
  const all = Object.values(mapping)
    .map((n) => n?.message)
    .filter((m) => m && m.author && m.content);

  // Filter to user/assistant roles with text content; ignore tool/system turns.
  const msgs = all
    .filter((m) => ['user', 'assistant'].includes(m.author?.role))
    .filter((m) => {
      const ct = m.content?.content_type;
      return ct === 'text' || ct === 'multimodal_text';
    })
    .sort((a, b) => (a.create_time ?? 0) - (b.create_time ?? 0));

  return msgs.map((m) => ({
    role: m.author.role,
    text: (m.content.parts || [])
      .filter((p) => typeof p === 'string')
      .join('\n')
      .trim(),
    attachments: (m.content.parts || [])
      .filter((p) => p && typeof p === 'object')
      .map((p) => p.asset_pointer || p.pointer || p.id || '[non-text]')
      .filter(Boolean),
    model: m.metadata?.model_slug || null,
    ts: m.create_time ?? null,
  }));
}

function convText(messages) {
  return messages.map((m) => m.text).join('\n');
}

function convDate(conv, messages) {
  const t = conv.create_time ?? messages[0]?.ts;
  if (!t) return null;
  return new Date(Number(t) * 1000).toISOString().slice(0, 10);
}

function bestModel(messages) {
  const models = messages
    .filter((m) => m.role === 'assistant' && m.model)
    .map((m) => m.model);
  if (!models.length) return null;
  // pick the most-frequent model_slug
  const counts = new Map();
  for (const m of models) counts.set(m, (counts.get(m) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function attachmentCount(messages) {
  return messages.reduce((n, m) => n + (m.attachments?.length || 0), 0);
}

// ── Markdown rendering ──────────────────────────────────────────────────────

function renderMarkdown({ conv, messages, classification, exportLabel }) {
  const date = convDate(conv, messages) || 'unknown';
  const model = bestModel(messages) || 'unknown';
  const fm = [
    '---',
    `pillar: ${classification.pillar}`,
    `source: chatgpt`,
    `export: ${exportLabel}`,
    `conv_id: ${conv.conversation_id || conv.id || 'unknown'}`,
    `title: ${JSON.stringify(conv.title || 'Untitled')}`,
    `date: ${date}`,
    `model: ${model}`,
    `client: ${classification.client ?? 'null'}`,
    `classifier: rule-v1`,
    `classifier_score: ${JSON.stringify(classification.score)}`,
    `tags: ${JSON.stringify(classification.tags)}`,
    `attachments: ${attachmentCount(messages)}`,
    `messages: ${messages.length}`,
    '---',
    '',
    `# ${conv.title || 'Untitled'}`,
    '',
    '## Summary',
    '',
    '_Not yet generated — run a summarizer pass when one exists._',
    '',
    '## Transcript',
    '',
  ];

  for (const m of messages) {
    fm.push(`### ${m.role}`);
    if (m.text) fm.push('', m.text, '');
    if (m.attachments?.length) {
      fm.push('', `_attachments:_ ${m.attachments.length}`, '');
    }
  }

  return fm.join('\n');
}

function targetPath({ classification, conv, exportLabel }) {
  const slug = slugify(conv.title || 'untitled');
  const id = shortId(conv.conversation_id || conv.id);
  const file = `${slug}-${exportLabel.toLowerCase()}-${id}.md`;

  if (classification.client) {
    return path.join(
      KNOWLEDGE,
      'build', 'clients', classification.client,
      'ai-convos', 'gpt', file
    );
  }

  const pillarDir =
    classification.pillar === '_unclassified' ? '_unclassified' : classification.pillar;
  return path.join(KNOWLEDGE, pillarDir, 'ai-convos', 'gpt', file);
}

// ── Main pass ───────────────────────────────────────────────────────────────

const stats = {
  total: 0,
  skipped_empty: 0,
  skipped_since: 0,
  by_pillar: { build: 0, grow: 0, run: 0, _unclassified: 0 },
  by_client: {},
  written: 0,
};

const reviewRows = [
  ['export', 'date', 'pillar', 'client', 'score_b', 'score_g', 'score_r', 'msgs', 'title', 'target'].join('\t'),
];

for (const ex of EXPORTS) {
  const files = ['conversations-000.json', 'conversations-001.json']
    .map((f) => path.join(ex.dir, f))
    .filter(fs.existsSync);

  for (const f of files) {
    const convs = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (VERBOSE) console.log(`[${ex.label}] ${path.basename(f)}: ${convs.length} convs`);

    for (const conv of convs) {
      stats.total += 1;
      const messages = linearizeMessages(conv);
      if (messages.length < 2) {
        stats.skipped_empty += 1;
        continue;
      }
      const date = convDate(conv, messages);
      if (SINCE && date && date < SINCE) {
        stats.skipped_since += 1;
        continue;
      }

      const classification = classify({
        title: conv.title || '',
        text: convText(messages),
      });

      stats.by_pillar[classification.pillar] += 1;
      if (classification.client) {
        stats.by_client[classification.client] =
          (stats.by_client[classification.client] || 0) + 1;
      }

      const target = targetPath({ classification, conv, exportLabel: ex.label });
      reviewRows.push([
        ex.label,
        date || '',
        classification.pillar,
        classification.client || '',
        classification.score.build,
        classification.score.grow,
        classification.score.run,
        messages.length,
        (conv.title || 'Untitled').replace(/\t/g, ' '),
        path.relative(ROOT, target),
      ].join('\t'));

      if (WRITE && !REVIEW) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, renderMarkdown({
          conv, messages, classification, exportLabel: ex.label,
        }));
        stats.written += 1;
      }
    }
  }
}

// Always emit the review TSV (outside the repo — contains private titles)
fs.mkdirSync(REPORTS, { recursive: true });
const reviewPath = path.join(REPORTS, 'gpt-classification.tsv');
fs.writeFileSync(reviewPath, reviewRows.join('\n'));

// ── Report ──────────────────────────────────────────────────────────────────

console.log('');
console.log('GPT knowledge ingest');
console.log('────────────────────');
console.log(`exports:        ${EXPORTS.map((e) => e.label).join(', ')}`);
console.log(`total convs:    ${stats.total}`);
console.log(`skipped empty:  ${stats.skipped_empty}  (< 2 user/assistant msgs)`);
if (SINCE) console.log(`skipped <${SINCE}: ${stats.skipped_since}`);
console.log('');
console.log('by pillar:');
for (const [p, n] of Object.entries(stats.by_pillar)) {
  const pct = stats.total ? Math.round((100 * n) / stats.total) : 0;
  console.log(`  ${p.padEnd(16)} ${String(n).padStart(4)}  (${pct}%)`);
}
console.log('');
console.log('quarantined (client matches):');
if (Object.keys(stats.by_client).length === 0) console.log('  none');
for (const [c, n] of Object.entries(stats.by_client)) {
  console.log(`  ${c.padEnd(24)} ${n}`);
}
console.log('');
console.log(`review TSV → ${reviewPath}`);
if (WRITE) {
  console.log(`written:  ${stats.written} markdown files under docs/knowledge/`);
} else {
  console.log('dry-run (no files written). re-run with --write to commit.');
}
