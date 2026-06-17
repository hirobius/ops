#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * record-health.mjs
 *
 * Appends the current token audit snapshot to the health history log so the
 * Overview rail can track trend over time.
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const reportPath = join(ROOT, 'src', 'app', 'data', 'token-audit-report.json');
const historyPath = join(ROOT, 'src', 'app', 'data', 'health-history.json');

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const history = JSON.parse(readFileSync(historyPath, 'utf8'));

const currentViolations = [
  report.counts?.ghostComponentVars ?? 0,
  report.counts?.themeForbiddenOverrides ?? 0,
  report.counts?.inlineStyleViolations ?? 0,
  report.counts?.semanticMappingViolations ?? 0,
  report.counts?.forbiddenOverrides ?? 0,
].reduce((sum, count) => sum + count, 0);

const nextHistory = Array.isArray(history) ? history.slice() : [];
nextHistory.push({
  recordedAt: report.generatedAt,
  generatedAt: report.generatedAt,
  score: report.integrity?.score ?? 0,
  grade: report.integrity?.grade ?? report.counts?.systemIntegrityGrade ?? 'F',
  totalViolations: currentViolations,
  counts: {
    ghostComponentVars: report.counts?.ghostComponentVars ?? 0,
    themeForbiddenOverrides: report.counts?.themeForbiddenOverrides ?? 0,
    inlineStyleViolations: report.counts?.inlineStyleViolations ?? 0,
    semanticMappingViolations: report.counts?.semanticMappingViolations ?? 0,
    forbiddenOverrides: report.counts?.forbiddenOverrides ?? 0,
  },
});

writeFileSync(historyPath, `${JSON.stringify(nextHistory, null, 2)}\n`);

const latest = nextHistory[nextHistory.length - 1];
console.log(`Recorded health snapshot: ${latest.grade} (${latest.score}%), ${latest.totalViolations} violations`);
