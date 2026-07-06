/**
 * parseJsonlLines — parse newline-delimited JSON (JSONL) into typed records.
 *
 * One null-safe parser for the ops dashboard's several JSONL feeds (routing-log,
 * agent-audit-log, retry telemetry, strength-history), each of which previously
 * re-implemented the same split / parse / filter loop. It trims each line, skips
 * blanks, and SKIPS malformed lines (try/catch) instead of throwing — so a single
 * bad line can't crash a whole view (it could in strength-tab's parseHistory,
 * which had no try/catch, before this).
 */
export function parseJsonlLines<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is T => entry !== null);
}
