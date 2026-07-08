/**
 * lib/tasks/tier — pure tier→model routing for the Fleet auto-dispatch board
 * (epic #41, Slice 1).
 *
 * This is the deterministic DIRECTIVE half of scripts/auto-assigner.mjs,
 * extracted for board-targeted use: no Ollama classification, no
 * clients/*.json plumbing, no network, no Date. Slice 2's dispatcher will
 * call `routeTask` on `auto_ok=true` rows and write `tier`/`model` back to
 * the `tasks` table (migration 0008).
 *
 * Model mapping mirrors auto-assigner's directive (Adrian, 2026-05-04): haiku
 * is removed from autonomous dispatch — 'min'-equivalent (mechanical) work
 * routes to sonnet, not haiku, because the defect-rate cost of haiku on
 * unattended runs outweighed the dispatch savings. High-stakes (judgment)
 * work routes to opus.
 */

/**
 * @typedef {'mechanical' | 'standard' | 'judgment'} Tier
 * @typedef {'sonnet' | 'opus'} Model
 * @typedef {{ priority?: string | null, effort?: string | null, title?: string | null }} TierableTask
 */

// Judgment: high-stakes work that needs frontier reasoning — architecture,
// data-shape changes, security/auth surfaces, or anything the title itself
// flags as ambiguous.
const JUDGMENT_TITLE_RE =
  /architecture|migration|security|refactor|validator|schema|auth|design|ambiguous/i;

// Mechanical: small, low-risk, rote edits — safe for the cheapest capable tier.
const MECHANICAL_TITLE_RE = /rename|typo|bump|lint|format|copy|chip|docs?\b/i;

/**
 * Classify a task into a dispatch tier from `priority`/`effort`/title
 * keywords. Deterministic — same input always yields the same tier.
 * @param {TierableTask} task
 * @returns {Tier}
 */
export function pickTier(task = {}) {
  const { priority = null, effort = null, title = '' } = task;
  const safeTitle = title ?? '';

  if (priority === 'high' || effort === 'L' || JUDGMENT_TITLE_RE.test(safeTitle)) {
    return 'judgment';
  }

  if ((effort === 'S' && priority !== 'high') || MECHANICAL_TITLE_RE.test(safeTitle)) {
    return 'mechanical';
  }

  return 'standard';
}

/**
 * Tier → model. Never haiku for autonomous dispatch (see module doc).
 * @param {Tier} tier
 * @returns {Model}
 */
export function pickModel(tier) {
  if (tier === 'judgment') return 'opus';
  if (tier === 'mechanical' || tier === 'standard') return 'sonnet';
  throw new Error(`Unknown tier: ${tier}`);
}

/**
 * Convenience: classify + route in one call.
 * @param {TierableTask} task
 * @returns {{ tier: Tier, model: Model }}
 */
export function routeTask(task = {}) {
  const tier = pickTier(task);
  return { tier, model: pickModel(tier) };
}
