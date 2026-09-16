/**
 * lib/chain/evidence.mjs — derive the chain's state from evidence, never assert it.
 *
 * Inputs are two things that cannot be argued with: the funnel counts from the
 * leads table, and which env vars are present on the server. Out of those comes
 * every verdict the Standing page shows — including where the chain breaks,
 * which is computed as the first stage nothing has ever reached.
 *
 * The rule that makes this worth doing: a stage is `proven` only if real rows
 * got through it. No amount of shipped code promotes a stage. That is the
 * opposite of the hand-authored percentages this replaced, which rated stages on
 * how finished their code looked and were wrong in both directions.
 */

import { STAGES } from './stages.mjs';

/**
 * - `proven`    — rows actually reached this stage.
 * - `ready`     — nothing has, but nothing is missing either: it is untried.
 * - `blocked`   — nothing has, and a named env var it needs is absent.
 * - `unknown`   — not measurable (the column is missing, i.e. a migration is
 *                 unapplied). Never collapsed into "zero got through".
 */

/**
 * @param {object} input
 * @param {Record<string, number|null>} input.funnel counts by metric key
 * @param {Record<string, boolean>} input.env presence by var name — NEVER values
 */
export function deriveChain({ funnel = {}, env = {}, liveness = null } = {}) {
  const links = STAGES.map((stage) => {
    const count = funnel[stage.metric] ?? null;
    const missingEnv = stage.envKeys.filter((k) => env[k] !== true);

    let state;
    if (count === null) state = 'unknown';
    else if (count > 0) state = 'proven';
    else if (missingEnv.length) state = 'blocked';
    else state = 'ready';

    // ops#322: `published` counts URLs STORED. Only this stage can be proven by
    // a dead link, so when a liveness probe ran, say what it found — without
    // changing `count`, which stays the stored figure the funnel nesting needs.
    const note = stage.metric === 'published' ? noteWithLiveness(stage.note, liveness) : stage.note;

    return { ...stage, note, count, missingEnv, state, ...(stage.metric === 'published' ? { liveness } : {}) };
  });

  return {
    links,
    // Where flow stops: the earliest stage nothing reached, that something
    // reached the stage before. A trailing run of zeros is one break, not five.
    firstBreak: findFirstBreak(links),
    // Where flow thins most AMONG stages that still pass something. A drop to
    // zero is the break, already reported above; counting it here would make
    // the two always name the same pair and cost the leak its own signal.
    biggestDrop: findBiggestDrop(links),
    reachedEnd: links.length ? (links[links.length - 1].count ?? 0) : 0,
  };
}

function findFirstBreak(links) {
  for (let i = 0; i < links.length; i += 1) {
    const here = links[i];
    if (here.count !== 0) continue;
    const prev = links[i - 1];
    // The first stage is a break only if nothing has ever entered the funnel.
    if (i === 0 || (prev && (prev.count ?? 0) > 0)) return here;
    return null;
  }
  return null;
}

function findBiggestDrop(links) {
  let worst = null;
  for (let i = 1; i < links.length; i += 1) {
    const prev = links[i - 1];
    const here = links[i];
    if (prev.count == null || here.count == null || prev.count === 0) continue;
    if (here.count === 0) continue; // that's the break, not a leak
    const kept = here.count / prev.count;
    if (worst === null || kept < worst.kept) {
      worst = { from: prev, to: here, kept, lost: prev.count - here.count };
    }
  }
  return worst;
}

/**
 * Append what the liveness probe found to stage 5's note.
 *
 * Says nothing when no probe ran — an absent claim beats a wrong one. An
 * `unchecked` URL is reported as unchecked, never folded into "down": the most
 * likely reason a probe fails is our own egress, not the site (ops#322).
 */
function noteWithLiveness(note, liveness) {
  if (!liveness || typeof liveness !== 'object' || !liveness.stored) return note;
  const { stored, live, dead, unchecked } = liveness;
  const parts = [`${live}/${stored} answered`];
  if (dead) parts.push(`${dead} did not`);
  if (unchecked) parts.push(`${unchecked} unchecked`);
  return `${note} Stored vs live: ${parts.join(', ')}.`;
}
