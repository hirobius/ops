#!/usr/bin/env node
/**
 * case-study-draft.mjs — schema-slot a free-form note into a
 * Context/Problem/Approach/Outcome/Artefacts case-study record.
 *
 * If the input text uses canonical `## Context` / `## Problem` /
 * `## Approach` / `## Outcome` / `## Artefacts` headings, each section is
 * filled with the text between headings. Otherwise sections are empty —
 * the raw input is always preserved in `rawNotes` so Adrian can iterate.
 *
 * Writes to `src/app/data/case-studies/<slug>.json`.
 *
 * Input: ${input} = path to a notes file (or a client slug whose
 * clients/<slug>/notes.md will be read). The slug is derived from the
 * file basename.
 *
 * Refs: t_2f4563eb / Self bundle — case-study-draft
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'src/app/data/case-studies');

export const CASE_STUDY_FIELDS = ['context', 'problem', 'approach', 'outcome', 'artefacts'];

const HEADING_RE = /^##\s+(context|problem|approach|outcome|artefacts)\s*$/i;

/**
 * Pure: turn free-form text + a slug into a case-study record.
 *
 * @param {{ slug: string, text: string }} input
 */
export function draftCaseStudy({ slug, text }) {
  const sections = Object.fromEntries(CASE_STUDY_FIELDS.map((f) => [f, '']));
  const lines = String(text || '').split(/\r?\n/);
  let current = null;
  /** @type {string[]} */
  let buffer = [];
  const flush = () => {
    if (current) sections[current] = buffer.join('\n').trim();
    buffer = [];
  };
  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      flush();
      current = m[1].toLowerCase();
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return {
    slug,
    draftedAt: new Date().toISOString(),
    rawNotes: text,
    ...sections,
  };
}

async function resolveInput(arg) {
  const cand = path.isAbsolute(arg) ? arg : path.join(REPO_ROOT, arg);
  try {
    const text = await readFile(cand, 'utf8');
    return { text, slug: path.basename(cand, path.extname(cand)) };
  } catch {
    // Not a path — try as slug → clients/<slug>/notes.md
    const clientNotes = path.join(REPO_ROOT, 'clients', arg, 'notes.md');
    const text = await readFile(clientNotes, 'utf8');
    return { text, slug: arg };
  }
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    process.stderr.write('case-study-draft: file path or client slug required\n');
    process.exit(1);
  }
  const { text, slug } = await resolveInput(input);
  const record = draftCaseStudy({ slug, text });
  await mkdir(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${slug}.json`);
  await writeFile(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
  process.stdout.write(`case-study-draft: wrote ${path.relative(REPO_ROOT, outPath)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`case-study-draft: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
