#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * print-health-commit.mjs
 *
 * Prints a copyable commit message that includes the current system integrity
 * grade from the latest token audit.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const reportPath = join(ROOT, 'src', 'app', 'data', 'token-audit-report.json');

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const grade = report.integrity?.grade ?? report.counts?.systemIntegrityGrade ?? 'F';
const score = report.integrity?.score ?? 0;
const violations = report.counts?.semanticMappingViolations ?? 0;

console.log(`Suggested commit message: chore: semantic audit ${grade} (${score}%) - ${violations} direct primitive violations`);
