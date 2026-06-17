/**
 * telemetry/pod-runs.mjs
 *
 * Append a per-pod cost record to telemetry/pod-runs.jsonl.
 * Call at the end of each autonomous build pod to track
 * model usage, token spend, and unit throughput over time.
 *
 * Schema (each JSONL line):
 * {
 *   ts:              ISO-8601 timestamp
 *   sessionId:       agent session identifier (e.g. "session:fresh-2026-05-02-w7-d")
 *   model:           model tier used ("haiku" | "sonnet" | "opus")
 *   totalTokens:     total tokens consumed (input + output)
 *   durationMs:      pod wall-clock duration in milliseconds
 *   unitsCompleted:  number of orchestration units finished
 *   unitIds:         string[] of completed unit IDs (optional)
 *   notes:           free-form string (optional)
 * }
 *
 * Usage:
 *   import { logPodRun } from './telemetry/pod-runs.mjs';
 *   logPodRun({ sessionId: 'my-pod', model: 'sonnet', totalTokens: 15000, durationMs: 180000, unitsCompleted: 3 });
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POD_RUNS_PATH = path.join(__dirname, 'pod-runs.jsonl');

/**
 * @param {{
 *   sessionId?: string,
 *   model?: string,
 *   totalTokens?: number,
 *   durationMs?: number,
 *   unitsCompleted?: number,
 *   unitIds?: string[],
 *   notes?: string
 * }} opts
 */
export function logPodRun(opts = {}) {
  const record = {
    ts: new Date().toISOString(),
    sessionId: opts.sessionId ?? 'unknown',
    model: opts.model ?? 'unknown',
    totalTokens: opts.totalTokens ?? 0,
    durationMs: opts.durationMs ?? 0,
    unitsCompleted: opts.unitsCompleted ?? 0,
    ...(opts.unitIds?.length ? { unitIds: opts.unitIds } : {}),
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
  try {
    fs.appendFileSync(POD_RUNS_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // Never let logging crash the pod
  }
}
