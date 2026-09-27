/**
 * adrianSteps — typed access to `docs/ai/adrian-steps.json`.
 *
 * Adrian's human to-do list used to live only as a separately-published guide
 * (a link nobody was reminded to open). This gives `/ops/standing`'s "Waiting
 * on you" lane the same copy-ready steps per issue, plus a small chore list
 * for tasks that have no issue at all — so the guide's content stops being a
 * second, driftable surface.
 *
 * `FleetIssue.repo` arrives as `owner/repo` (e.g. `hirobius/ops`), but a
 * caller may reasonably pass a bare repo name too, so `stepsFor` normalises
 * before looking up the `owner/repo#n` key the JSON is keyed by.
 */

import stepsJson from '../../../../../docs/ai/adrian-steps.json';

export interface StepItem {
  text: string;
  href?: string;
  copy?: string;
}

export interface Chore {
  id: string;
  title: string;
  steps: StepItem[];
}

interface AdrianStepsData {
  guideUrl: string;
  issues: Record<string, { steps: StepItem[] }>;
  chores: Chore[];
}

const data = stepsJson as AdrianStepsData;

/** Link to the full step-by-step guide this data was sourced from. */
export const guideUrl: string = data.guideUrl;

/** Chores with no issue to attach to. */
export const chores: readonly Chore[] = data.chores;

const DEFAULT_OWNER = 'hirobius';

/** `ops` → `hirobius/ops`; `hirobius/ops` is left as-is. */
function normaliseRepo(repo: string): string {
  return repo.includes('/') ? repo : `${DEFAULT_OWNER}/${repo}`;
}

/**
 * Copy-ready steps for one fleet issue, or `undefined` when the guide has
 * nothing for it. `repo` may be `owner/repo` or a bare repo name.
 */
export function stepsFor(repo: string, number: number): StepItem[] | undefined {
  const key = `${normaliseRepo(repo)}#${number}`;
  return data.issues[key]?.steps;
}
