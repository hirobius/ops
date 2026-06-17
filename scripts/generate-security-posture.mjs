#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/generate-security-posture.mjs
 *
 * Builds src/app/data/security-posture.json from three real data sources:
 *   1. pnpm audit --json     → open finding counts per severity
 *   2. docs/security/audit-log.md → last entry date + derived grade
 *   3. docs/security/agent-audit-log.jsonl → last logged run
 *
 * Run: node scripts/generate-security-posture.mjs
 * Called automatically via: pnpm audit:sidecar
 *
 * Output shape (SecurityPosture):
 * {
 *   generatedAt: ISO string,
 *   audit: {
 *     critical: number, high: number, moderate: number, low: number,
 *     total: number, lastRunDate: string | null
 *   },
 *   auditLog: { lastEntryDate: string | null, grade: string | null },
 *   agentLog:  { lastTimestamp: string | null, lastUnitId: string | null, lastOutcome: string | null }
 * }
 */

import fs   from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const OUT_PATH  = path.join(ROOT, 'src', 'app', 'data', 'security-posture.json');

// ── 1. pnpm audit ─────────────────────────────────────────────────────────────

function runAudit() {
  try {
    const raw = execSync('pnpm audit --json', {
      cwd: ROOT,
      encoding: 'utf8',
      // pnpm audit exits 1 when vulnerabilities exist — capture output regardless
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(raw);
    const v = parsed?.metadata?.vulnerabilities ?? {};
    return {
      critical: v.critical ?? 0,
      high:     v.high     ?? 0,
      moderate: v.moderate ?? 0,
      low:      v.low      ?? 0,
      total:    (v.critical ?? 0) + (v.high ?? 0) + (v.moderate ?? 0) + (v.low ?? 0),
      lastRunDate: new Date().toISOString().slice(0, 10),
    };
  } catch (err) {
    // execSync throws when exit code != 0; stdout is in err.stdout
    try {
      const parsed = JSON.parse(err.stdout ?? '{}');
      const v = parsed?.metadata?.vulnerabilities ?? {};
      return {
        critical: v.critical ?? 0,
        high:     v.high     ?? 0,
        moderate: v.moderate ?? 0,
        low:      v.low      ?? 0,
        total:    (v.critical ?? 0) + (v.high ?? 0) + (v.moderate ?? 0) + (v.low ?? 0),
        lastRunDate: new Date().toISOString().slice(0, 10),
      };
    } catch {
      console.warn('[security-posture] pnpm audit failed to produce parseable JSON:', err.message);
      return { critical: null, high: null, moderate: null, low: null, total: null, lastRunDate: null };
    }
  }
}

// ── 2. docs/security/audit-log.md ─────────────────────────────────────────────
// Reads the last entry date from heading lines like "## 2026-05-03 — ...".
// Grade is derived from live pnpm audit data (passed in), not from parsing prose.

function parseAuditLog(auditData) {
  const logPath = path.join(ROOT, 'docs', 'security', 'audit-log.md');
  if (!fs.existsSync(logPath)) {
    return { lastEntryDate: null, grade: null };
  }

  const content = fs.readFileSync(logPath, 'utf8');

  // Find all date headings like "## 2026-05-03 — ..."
  const dateMatches = [...content.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)];
  const lastEntryDate = dateMatches.length > 0
    ? dateMatches[dateMatches.length - 1][1]
    : null;

  // Derive grade from actual audit counts (live data is authoritative)
  let grade = null;
  if (auditData.critical !== null && auditData.high !== null) {
    if (auditData.critical > 0 || auditData.high > 0) grade = 'F';
    else if (auditData.moderate > 0)                  grade = 'C';
    else if (auditData.low > 0)                       grade = 'B';
    else                                              grade = 'A';
  }

  return { lastEntryDate, grade };
}

// ── 3. docs/security/agent-audit-log.jsonl ────────────────────────────────────

function parseAgentLog() {
  const logPath = path.join(ROOT, 'docs', 'security', 'agent-audit-log.jsonl');
  if (!fs.existsSync(logPath)) {
    return { lastTimestamp: null, lastUnitId: null, lastOutcome: null };
  }

  const lines = fs.readFileSync(logPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { lastTimestamp: null, lastUnitId: null, lastOutcome: null };
  }

  try {
    const last = JSON.parse(lines[lines.length - 1]);
    return {
      lastTimestamp: last.timestamp ?? null,
      lastUnitId:    last.unit_id   ?? null,
      lastOutcome:   last.outcome   ?? null,
    };
  } catch {
    return { lastTimestamp: null, lastUnitId: null, lastOutcome: null };
  }
}

// ── Assemble + write ──────────────────────────────────────────────────────────

const auditData = runAudit();
const posture = {
  generatedAt: new Date().toISOString(),
  audit:    auditData,
  auditLog: parseAuditLog(auditData),
  agentLog: parseAgentLog(),
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(posture, null, 2) + '\n', 'utf8');

console.log('[security-posture] written →', path.relative(ROOT, OUT_PATH));
console.log('  audit findings:', posture.audit.total, '| grade:', posture.auditLog.grade, '| last agent run:', posture.agentLog.lastTimestamp);
