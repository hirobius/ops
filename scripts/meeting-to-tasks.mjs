#!/usr/bin/env node
/**
 * meeting-to-tasks.mjs — extract action items + decisions from a
 * meeting transcript, append them to docs/ai/proposed-units.jsonl.
 *
 * Deterministic v1: regex over recognized prefixes (ACTION/TODO/
 * Action item/Next steps/DECISION) and markdown checkbox lines
 * (`- [ ] …`). Each match becomes one proposed-unit JSONL line
 * tagged with the client slug + transcript path.
 *
 * Input: ${input} = transcript file path (relative or absolute).
 * Optional second arg: client slug. (Skill-runner only passes the
 * primary input today; slug is for direct CLI use.)
 *
 * Refs: t_d1fb7fd7 / Client-augment — meeting-to-tasks
 */

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROPOSED_UNITS_PATH = path.join(REPO_ROOT, 'docs/ai/proposed-units.jsonl');

const PREFIX_RULES = [
  { re: /^\s*action\s+item\s*:\s*(.+?)\s*$/i, kind: 'ACTION' },
  { re: /^\s*action\s*:\s*(.+?)\s*$/i, kind: 'ACTION' },
  { re: /^\s*next\s+steps?\s*:\s*(.+?)\s*$/i, kind: 'ACTION' },
  { re: /^\s*todo\s*:\s*(.+?)\s*$/i, kind: 'TODO' },
  { re: /^\s*decision\s*:\s*(.+?)\s*$/i, kind: 'DECISION' },
  { re: /^\s*-\s*\[\s\]\s*(.+?)\s*$/, kind: 'TODO' }, // markdown unchecked
];

/**
 * Extract recognized action items from a free-form transcript.
 *
 * @param {string} text
 * @returns {Array<{ kind: 'ACTION' | 'TODO' | 'DECISION', text: string, lineNumber: number }>}
 */
export function extractActionItems(text) {
  const items = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of PREFIX_RULES) {
      const m = line.match(rule.re);
      if (m && m[1].trim().length > 0) {
        items.push({ kind: rule.kind, text: m[1].trim(), lineNumber: idx + 1 });
        return;
      }
    }
  });
  return items;
}

/**
 * Map extracted items → proposed-unit JSONL entries.
 *
 * @param {ReturnType<typeof extractActionItems>} items
 * @param {{ slug?: string, transcriptPath: string, ts: string }} ctx
 */
export function toProposedUnits(items, { slug = 'unscoped', transcriptPath, ts }) {
  return items.map((item, idx) => {
    const idSafe = item.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
    const tsCompact = ts.replace(/[^0-9]/g, '').slice(0, 12);
    return {
      ts,
      fromUnitId: `meeting-${slug}-${tsCompact}`,
      reason: item.kind === 'DECISION' ? 'cleanup' : 'side-quest',
      urgency: 'eventually',
      proposedUnit: {
        id: `meeting-${slug}-${tsCompact}-${idx}-${idSafe || 'item'}`,
        name: `${item.kind === 'DECISION' ? 'Capture decision' : 'Follow up'}: ${item.text.slice(0, 80)}`,
        description: `From meeting transcript ${transcriptPath} (line ${item.lineNumber}): ${item.text}`,
        dependsOn: [],
        validationCmd: 'true',
        agentNotes: [
          `Extracted from ${transcriptPath} line ${item.lineNumber}`,
          `Client slug: ${slug}`,
          `Original marker: ${item.kind}`,
        ],
        tier: 'T2',
        model: 'sonnet',
        effort: 'min',
        safeForUnattended: false,
      },
    };
  });
}

async function main() {
  const transcriptPath = process.argv[2];
  const slug = process.argv[3];
  if (!transcriptPath) {
    process.stderr.write('meeting-to-tasks: transcript path required\n');
    process.exit(1);
  }
  const resolved = path.isAbsolute(transcriptPath)
    ? transcriptPath
    : path.join(REPO_ROOT, transcriptPath);
  const text = await readFile(resolved, 'utf8');
  const items = extractActionItems(text);
  const ts = new Date().toISOString();
  const lines = toProposedUnits(items, { slug, transcriptPath, ts });

  await mkdir(path.dirname(PROPOSED_UNITS_PATH), { recursive: true });
  const jsonl = lines.map((l) => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : '');
  if (jsonl) await appendFile(PROPOSED_UNITS_PATH, jsonl);

  process.stdout.write(
    `meeting-to-tasks: appended ${lines.length} item(s) from ${transcriptPath}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`meeting-to-tasks: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
