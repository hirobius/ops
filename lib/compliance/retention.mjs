/**
 * lib/compliance/retention.mjs — the retention window (compliance #37, Adrian
 * 2026-07-07), shared by the purge job and the public privacy policy so the
 * number a prospect reads is the number scripts/purge-stale-leads.mjs enforces.
 */

/** Months after first collection before an unworked, unsuppressed lead is purged. */
export const RETENTION_MONTHS = 12;
