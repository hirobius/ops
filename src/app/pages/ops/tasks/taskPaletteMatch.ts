/**
 * taskPaletteMatch — the pure fuzzy-match/ranking helper behind the ⌘K
 * CommandPalette's Level 1 (ops#142). Data-in/data-out, no DOM/DS
 * dependency, so ranking is unit-tested independently of the palette's
 * rendering — same idiom as taskMeta.ts's other pure helpers.
 *
 * Searches title (highest weight), the `owner/repo#N` ref (or raw key for
 * non-issue-backed rows), and lane — an operator jumping by memory usually
 * knows one of those three, not which field it's in.
 */
import type { Task } from './types';
import { taskRef } from './taskMeta';

/**
 * Scores `needle` against `haystack`, or null when it doesn't match at all.
 * A contiguous substring match always outranks a scattered one; among
 * substring matches, an earlier occurrence ranks higher (title-start beats
 * title-middle). Among scattered (subsequence) matches, a tighter span ranks
 * higher — the classic fuzzy-finder heuristic.
 */
function fuzzyScore(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();

  const idx = h.indexOf(n);
  if (idx !== -1) return 1000 - idx;

  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const ch of n) {
    const found = h.indexOf(ch, cursor);
    if (found === -1) return null;
    if (first === -1) first = found;
    last = found;
    cursor = found + 1;
  }
  const span = last - first + 1;
  // Capped well below any substring-match score so a loose scatter never
  // outranks a tight one, however early it starts.
  return Math.max(1, 200 - span - first);
}

const FIELD_WEIGHTS: ReadonlyArray<[(t: Task) => string, number]> = [
  [(t) => t.title, 3],
  [(t) => taskRef(t) ?? t.key, 2],
  [(t) => t.lane, 1],
];

/** The best weighted field score for `t` against `query`, or null if none match. */
function bestScore(t: Task, query: string): number | null {
  let best: number | null = null;
  for (const [field, weight] of FIELD_WEIGHTS) {
    const score = fuzzyScore(field(t), query);
    if (score === null) continue;
    const weighted = score * weight;
    if (best === null || weighted > best) best = weighted;
  }
  return best;
}

/**
 * Ranks `tasks` against `query` (fuzzy title/ref/lane match), highest score
 * first. An empty/whitespace query is a no-op — returns `tasks` in their
 * given order — so the palette can list everything before the operator
 * types anything.
 */
export function matchTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim();
  if (!q) return tasks;

  return tasks
    .map((task) => ({ task, score: bestScore(task, q) }))
    .filter((m): m is { task: Task; score: number } => m.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((m) => m.task);
}
