/**
 * email-triage classifier — pure, deterministic, side-effect-free.
 *
 * Input  : { from, subject, body? } (body optional; never persisted)
 * Output : { category, confidence, score, runnerUp, signalsHit, allScores }
 *
 * Scoring (per category, summed):
 *   from exact match       +10
 *   from pattern (substr)  +5  (e.g. "@docusign.net" matches "noreply@docusign.net")
 *   subject keyword (substr, ci) +3
 *   body keyword (substr, ci)    +1
 *
 * Highest score wins. Ties → fallback (configured in categories.json).
 * Top score below threshold → fallback. Confidence = score / (score + runnerUp).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATEGORIES_PATH = path.join(HERE, 'categories.json');

let _catCache = null;
export function loadCategories() {
  if (_catCache) return _catCache;
  _catCache = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
  return _catCache;
}

function ci(s) { return (s ?? '').toLowerCase(); }

function scoreFrom(from, fromPatterns) {
  const f = ci(from);
  let score = 0;
  const hits = [];
  for (const p of fromPatterns ?? []) {
    const lp = ci(p);
    if (!lp) continue;
    if (f === lp) { score += 10; hits.push(`from-exact:${p}`); }
    else if (f.includes(lp)) { score += 5; hits.push(`from-pattern:${p}`); }
  }
  return { score, hits };
}

function scoreKeywords(text, keywords, weight, kind) {
  const t = ci(text);
  let score = 0;
  const hits = [];
  for (const k of keywords ?? []) {
    const lk = ci(k);
    if (!lk) continue;
    if (t.includes(lk)) { score += weight; hits.push(`${kind}:${k}`); }
  }
  return { score, hits };
}

export function classify({ from = '', subject = '', body = '' }, categoriesArg = null) {
  const cats = categoriesArg ?? loadCategories();
  const threshold = cats._meta?.scoring?.thresholdForCategorize ?? 3;
  const fallback = cats._meta?.scoring?.fallback ?? 'internal';

  const allScores = [];
  for (const cat of cats.categories) {
    const fromR    = scoreFrom(from, cat.rules?.fromPatterns);
    const subjectR = scoreKeywords(subject, cat.rules?.subjectKeywords, 3, 'subject');
    const bodyR    = scoreKeywords(body,    cat.rules?.bodyKeywords,    1, 'body');
    const total    = fromR.score + subjectR.score + bodyR.score;
    const signals  = [...fromR.hits, ...subjectR.hits, ...bodyR.hits];
    allScores.push({ id: cat.id, score: total, signals });
  }

  allScores.sort((a, b) => b.score - a.score);
  const [first, second] = allScores;
  const runnerUp = second?.score ?? 0;

  let chosen;
  if (!first || first.score < threshold) chosen = fallback;
  else if (first.score === runnerUp)     chosen = fallback;
  else                                   chosen = first.id;

  const confidence = first && first.score > 0
    ? +(first.score / (first.score + runnerUp || 1)).toFixed(3)
    : 0;

  return {
    category: chosen,
    confidence,
    score: first?.score ?? 0,
    runnerUp,
    signalsHit: first?.signals ?? [],
    allScores,
  };
}
