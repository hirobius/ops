#!/usr/bin/env node
/**
 * Run every fixture in fixtures/ through the classifier and report.
 * Exit code: 0 if all expected categories match; 1 otherwise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(HERE, 'fixtures');

const files = fs.readdirSync(FIXTURES_DIR)
  .filter(f => f.endsWith('.json'))
  .filter(f => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8'));
      return typeof j.expected === 'string';
    } catch { return false; }
  })
  .sort();

let pass = 0, fail = 0;
const failures = [];

console.log(`\nemail-triage classifier test — ${files.length} fixtures\n`);
console.log('result  expected            actual              conf   score  signals');
console.log('─'.repeat(110));

for (const f of files) {
  const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf8'));
  const result = classify(fixture);
  const ok = result.category === fixture.expected;
  if (ok) pass++; else { fail++; failures.push({ file: f, expected: fixture.expected, got: result }); }

  const tag      = ok ? '  ✓' : '  ✗';
  const expected = String(fixture.expected).padEnd(20);
  const actual   = String(result.category).padEnd(20);
  const conf     = String(result.confidence).padEnd(7);
  const score    = String(`${result.score}/${result.runnerUp}`).padEnd(7);
  const signals  = result.signalsHit.slice(0, 3).join(', ');
  console.log(`${tag}     ${expected}${actual}${conf}${score}${signals}`);
}

console.log('─'.repeat(110));
console.log(`\npass=${pass}  fail=${fail}  accuracy=${(pass / files.length * 100).toFixed(1)}%\n`);

if (failures.length) {
  console.log('failures:');
  for (const f of failures) {
    console.log(`  ${f.file}`);
    console.log(`    expected ${f.expected}, got ${f.got.category} (score ${f.got.score}, runner-up ${f.got.runnerUp})`);
    console.log(`    signals: ${f.got.signalsHit.join(', ') || '(none)'}`);
    console.log(`    top-3 scores: ${f.got.allScores.slice(0, 3).map(s => `${s.id}=${s.score}`).join(', ')}`);
  }
  process.exit(1);
}

process.exit(0);
