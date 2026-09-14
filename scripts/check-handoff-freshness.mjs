#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-handoff-freshness.mjs
 *
 * Flags a "Now" section bullet in docs/ai/HANDOFF.md whose claim is
 * contradicted by a newer dated entry in the "Decisions" section — the
 * ops#210 bug class (a lifted feature freeze sat as an active "Now" bullet
 * three days after the Decisions log recorded it lifted, misdirecting the
 * next session).
 *
 * Heuristic: for each "Now" bullet that starts with a **bolded** lead phrase
 * containing an inline (YYYY-MM-DD) date, and for each "Decisions" bullet
 * (which is always dated), flag the Now bullet when a Decisions entry dated
 * strictly AFTER the Now bullet's date shares 2+ significant words (length
 * >= 4, common stopwords excluded) with the Now bullet's bolded phrase — i.e.
 * a later decision revisited the same topic and "Now" was never reconciled.
 *
 * This is a lint, not a certainty: it under-flags (many Now bullets carry no
 * inline date to anchor against, so they're skipped rather than guessed at)
 * rather than risk false positives. Manual channel — run it at session end
 * per CLAUDE.md's HANDOFF contract, before handing off to the next session.
 *
 * Usage:
 *   node scripts/check-handoff-freshness.mjs
 *   node scripts/check-handoff-freshness.mjs --json
 *   node scripts/check-handoff-freshness.mjs --fixture-mode   (reads $FIXTURE_FILE)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_FILE = join(ROOT, 'docs', 'ai', 'HANDOFF.md');

const STOPWORDS = new Set([
  'this',
  'that',
  'with',
  'from',
  'have',
  'will',
  'also',
  'only',
  'never',
  'being',
  'which',
  'their',
  'after',
  'before',
  'every',
  'across',
  'about',
  'there',
  'these',
  'those',
  'while',
  'where',
  'when',
  'what',
  'into',
  'onto',
  'upon',
  'been',
  'were',
  'they',
  'them',
  'then',
  'still',
  'some',
  'more',
  'most',
  'than',
  'such',
  'both',
  'each',
  'over',
  'under',
  'same',
  'very',
  'just',
  'make',
  'made',
  'back',
  'left',
  'used',
  'uses',
  'using',
  'open',
  'once',
  'here',
  'ever',
  'none',
  'session',
  'sessions',
]);

function significantWords(text) {
  return [
    ...new Set(
      (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])
        .map((w) => w.replace(/^-+|-+$/g, ''))
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ];
}

function extractDate(text) {
  const m = text && text.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((l) => l.trim().startsWith(`## ${heading}`));
  if (startIdx === -1) return '';
  let end = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, end).join('\n');
}

// A section body is a flat list of "- " bullets; a bullet may wrap onto
// following lines until the next top-level "- " starts.
function extractBullets(sectionBody) {
  const lines = sectionBody.split('\n');
  const bullets = [];
  let current = null;
  for (const line of lines) {
    if (/^-\s/.test(line)) {
      if (current !== null) bullets.push(current);
      current = line;
    } else if (current !== null) {
      current += '\n' + line;
    }
  }
  if (current !== null) bullets.push(current);
  return bullets;
}

function boldPhrase(bullet) {
  const m = bullet.match(/\*\*([^*]+)\*\*/);
  return m ? m[1] : null;
}

export function findStaleNowBullets(markdown) {
  const nowBody = extractSection(markdown, 'Now');
  const decisionsBody = extractSection(markdown, 'Decisions');

  const nowBullets = extractBullets(nowBody)
    .map((text) => {
      const bold = boldPhrase(text);
      return { text, bold, date: extractDate(bold) };
    })
    .filter((b) => b.bold && b.date);

  const decisions = extractBullets(decisionsBody)
    .map((text) => ({ text, date: extractDate(text) }))
    .filter((d) => d.date);

  const stale = [];
  for (const now of nowBullets) {
    const nowWords = significantWords(now.bold);
    if (nowWords.length === 0) continue;

    for (const decision of decisions) {
      if (decision.date <= now.date) continue; // must be strictly newer
      const decisionWords = new Set(significantWords(decision.text));
      const shared = nowWords.filter((w) => decisionWords.has(w));
      if (shared.length >= 2) {
        stale.push({
          nowBullet: now.bold,
          nowDate: now.date,
          decisionDate: decision.date,
          decisionExcerpt: decision.text.trim().replace(/\s+/g, ' ').slice(0, 160),
          sharedWords: shared,
        });
        break; // one contradiction is enough to flag this bullet
      }
    }
  }
  return stale;
}

function main() {
  const args = process.argv.slice(2);
  const JSON_MODE = args.includes('--json');
  const FIXTURE_MODE = args.includes('--fixture-mode');
  const file = FIXTURE_MODE && process.env.FIXTURE_FILE ? process.env.FIXTURE_FILE : DEFAULT_FILE;

  if (!existsSync(file)) {
    console.log(`check-handoff-freshness: ${file} not found — skip`);
    process.exit(0);
  }

  const markdown = readFileSync(file, 'utf8');
  const violations = findStaleNowBullets(markdown);

  if (JSON_MODE) {
    console.log(JSON.stringify({ violations }, null, 2));
    process.exit(violations.length > 0 ? 1 : 0);
  }

  if (violations.length === 0) {
    console.log('✓ check-handoff-freshness — no stale "Now" bullets found.');
    process.exit(0);
  }

  console.error(`✗ check-handoff-freshness — ${violations.length} stale "Now" bullet(s):\n`);
  for (const v of violations) {
    console.error(`- "${v.nowBullet}" (dated ${v.nowDate})`);
    console.error(
      `  contradicted by a newer ${v.decisionDate} Decisions entry: ${v.decisionExcerpt}...`,
    );
    console.error(`  shared topic words: ${v.sharedWords.join(', ')}\n`);
  }
  console.error(
    'Fix: reconcile the "Now" section bullet against the newer Decisions entry (edit or remove it).',
  );
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
