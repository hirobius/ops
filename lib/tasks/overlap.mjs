/**
 * lib/tasks/overlap.mjs — file-overlap gate for the fleet dispatcher (issue
 * #47, B.3). Revives the one genuinely agent-safety guardrail the old
 * orchestration tooling had (`check-unit-overlap.mjs`, deleted in `662d94c`,
 * registry entry deleted in `806e25f`): a pre-dispatch gate that refuses to
 * fire a task if any in-flight task declares overlapping file paths — "two
 * agents must NEVER touch the same file."
 *
 * Path matching is a plain prefix check, not a glob engine — this repo has
 * no direct glob-matching dependency (`picomatch` is a transitive version
 * pin in package.json's pnpm.overrides, not something to import from). A
 * `touches` entry can be an exact file path or a directory prefix (e.g.
 * `src/app/pages/` covers everything under it).
 *
 * A task with no `touches` declared is a KNOWN GAP, not a false-safe: nothing
 * populates `touches` automatically yet (see migration 0009 + issue #47), so
 * such a task is never blocked and never blocks others. It's on the honor
 * system until a follow-up wires inference from the task body/diff.
 */

function normalize(p) {
  return typeof p === 'string' ? p.trim().replace(/^\.\//, '') : '';
}

/** True when two path/prefix strings could touch the same file. */
export function pathsOverlap(a, b) {
  const pa = normalize(a);
  const pb = normalize(b);
  if (!pa || !pb) return false;
  if (pa === pb) return true;
  const da = pa.endsWith('/') ? pa : `${pa}/`;
  const db = pb.endsWith('/') ? pb : `${pb}/`;
  return da.startsWith(db) || db.startsWith(da);
}

/** True when any path in `touchesA` overlaps any path in `touchesB`. Empty/missing lists never overlap. */
export function touchesOverlap(touchesA, touchesB) {
  const a = Array.isArray(touchesA) ? touchesA : [];
  const b = Array.isArray(touchesB) ? touchesB : [];
  if (a.length === 0 || b.length === 0) return false;
  return a.some((pa) => b.some((pb) => pathsOverlap(pa, pb)));
}

/**
 * Pure: partition dispatch candidates into those clear to fire and those
 * blocked because their declared `touches` overlap an already-in-flight
 * task, OR another candidate earlier in this same run (first-in-run wins;
 * later ones with the same paths wait for the next pass rather than both
 * firing together).
 *
 * @param {Array<{task:object, tier:string, model:string}>} candidates
 * @param {Array<{key:string, touches?:string[]}>} inFlightTasks — dispatched, not yet done
 * @returns {{ clear: Array, blocked: Array<{task:object, tier:string, model:string, conflictsWith:string}> }}
 */
export function partitionByOverlap(candidates, inFlightTasks) {
  const clear = [];
  const blocked = [];
  const claimed = [];

  for (const t of inFlightTasks ?? []) {
    if (t?.key && Array.isArray(t.touches) && t.touches.length) {
      claimed.push({ key: t.key, touches: t.touches });
    }
  }

  for (const candidate of candidates ?? []) {
    const touches = candidate?.task?.touches;
    const conflict = claimed.find((c) => touchesOverlap(touches, c.touches));
    if (conflict) {
      blocked.push({ ...candidate, conflictsWith: conflict.key });
      continue;
    }
    clear.push(candidate);
    if (Array.isArray(touches) && touches.length) {
      claimed.push({ key: candidate.task.key, touches });
    }
  }

  return { clear, blocked };
}

/**
 * Pure: find every pair of tasks (from any list — typically all currently
 * in-flight) whose declared `touches` overlap. Used by the standalone
 * `scripts/check-unit-overlap.mjs` CLI to audit current fleet state on
 * demand, independent of a dispatch run.
 *
 * @param {Array<{key:string, touches?:string[]}>} tasks
 * @returns {Array<{ a: string, b: string }>}
 */
export function findAllOverlaps(tasks) {
  const withTouches = (Array.isArray(tasks) ? tasks : []).filter(
    (t) => t?.key && Array.isArray(t.touches) && t.touches.length > 0,
  );
  const pairs = [];
  for (let i = 0; i < withTouches.length; i += 1) {
    for (let j = i + 1; j < withTouches.length; j += 1) {
      if (touchesOverlap(withTouches[i].touches, withTouches[j].touches)) {
        pairs.push({ a: withTouches[i].key, b: withTouches[j].key });
      }
    }
  }
  return pairs;
}
