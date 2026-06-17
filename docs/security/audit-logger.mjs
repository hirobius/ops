/**
 * docs/security/audit-logger.mjs
 *
 * Shared per-run structured audit logger for autonomous agent scripts.
 * Appends one JSON line per run to docs/security/agent-audit-log.jsonl.
 *
 * Schema (each JSONL line):
 * {
 *   timestamp:     ISO-8601 string
 *   unit_id:       orchestration unit ID (or null for non-unit runs)
 *   agent_id:      identifier of the running agent
 *   files_written: string[] — repo-relative paths written (never file contents)
 *   commands_run:  string[] — shell commands executed (never env var values)
 *   commit_hash:   short git hash of the unit's commit, or null on dry-run / failure
 *   outcome:       "done" | "failed" | "aborted" | "dry-run"
 * }
 *
 * Security rules:
 *  - Never log file contents — only paths.
 *  - Never log env var values.
 *  - Append-only — never truncate or overwrite the log file.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIT_LOG_PATH = path.join(ROOT, 'docs/security/agent-audit-log.jsonl');

/**
 * Append one audit entry to docs/security/agent-audit-log.jsonl.
 *
 * @param {{
 *   unit_id:       string | null,
 *   agent_id:      string,
 *   files_written: string[],
 *   commands_run:  string[],
 *   commit_hash:   string | null,
 *   outcome:       'done' | 'failed' | 'aborted' | 'dry-run'
 * }} entry
 */
export function appendAuditEntry(entry) {
  try {
    const record = {
      timestamp:     new Date().toISOString(),
      unit_id:       entry.unit_id    ?? null,
      agent_id:      entry.agent_id   ?? 'unknown',
      files_written: Array.isArray(entry.files_written) ? entry.files_written : [],
      commands_run:  Array.isArray(entry.commands_run)  ? entry.commands_run  : [],
      commit_hash:   entry.commit_hash ?? null,
      outcome:       entry.outcome     ?? 'failed',
    };
    // Ensure the directory exists (it should, but guard for safety)
    fs.mkdirSync(path.dirname(AUDIT_LOG_PATH), { recursive: true });
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
  } catch {
    // Never let audit logging crash the agent
  }
}
