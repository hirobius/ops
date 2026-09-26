/**
 * libraryData — typed access to the `/ops/library` index and its reports.
 * JSON gives us `string` everywhere; the narrowing happens once here so a page
 * never casts at a use site.
 *
 * Data: docs/ai/library.json, docs/ai/build-vs-buy.json,
 * docs/ai/state-of-play.json, docs/ai/pipeline-walkthrough.json.
 *
 * @category Internal
 * @tier utility
 */

import libraryJson from '../../../../../docs/ai/library.json';
import bvbJson from '../../../../../docs/ai/build-vs-buy.json';
import stateOfPlayJson from '../../../../../docs/ai/state-of-play.json';
import pipelineWalkthroughJson from '../../../../../docs/ai/pipeline-walkthrough.json';

/** `hds` = a native page on the design system; `legacy` = standalone HTML shown framed until migrated. */
export type RenderMode = 'hds' | 'legacy';

export interface LibraryEntry {
  slug: string;
  title: string;
  date: string;
  summary: string;
  render: RenderMode;
  /** Set when the report already lives at its own route (e.g. `/ops/audit`). */
  href?: string;
  /** Repo path of a legacy HTML file. */
  source?: string;
}

export type Verdict = 'REPLACE' | 'WRAP' | 'KEEP';
export type Effort = 'S' | 'M' | 'L';

export interface BvbSystem {
  id: string;
  name: string;
  why: string;
  repo: string;
  files: number;
  lines: number;
  commits90d: number;
  verdict: Verdict;
  alternative: string;
  alsoConsider: string | null;
  cost: string;
  effort: Effort | null;
  payoff: number;
  payoffNote: string;
}

export interface BuildVsBuy {
  date: string;
  title: string;
  session: string;
  artifact: string;
  verdict: string;
  topFive: { systemId: string; title: string; body: string }[];
  systems: BvbSystem[];
  businessTools: { need: string; pick: string; why: string }[];
  notes: string[];
}

export const library = (libraryJson as { entries: LibraryEntry[] }).entries;
export const buildVsBuy = bvbJson as BuildVsBuy;

export type CommitmentStatus = 'done' | 'part' | 'stop';

export interface StateOfPlay {
  date: string;
  artifact: string;
  headline: string;
  lede: string;
  northStar: string;
  scopeTest: string;
  vitals: { label: string; value: string; zero: boolean }[];
  vitalsNote: string;
  builtAndWorking: string;
  commitments: { n: number; title: string; status: CommitmentStatus; verdict: string }[];
  blockersIntro: string;
  blockersCallout: string;
  blockers: { set: string; href: string | null; unlocks: string; time: string }[];
  structural: {
    triageTitle: string;
    triageBody: string;
    triageBuckets: { bucket: string; count: number; meaning: string }[];
    triageNote1: string;
    triageNote2: string;
    repoRows: { repo: string; open: number; queued: number; blocked: number; total?: boolean }[];
    sev1Title: string;
    sev1Body: string;
  };
  nextSteps: string[];
  handoffIntro: string;
  handoff: { issue: string; what: string; size: string }[];
  decisionsTitle: string;
  decisionsIntro: string;
  decisions: string[];
  decisionsFourth: string;
  decisionsFourthHref: string;
  safetyTitle: string;
  safety: string[];
  footer: { note: string; source: string; sessionNote: string };
}

export const stateOfPlay = stateOfPlayJson as StateOfPlay;

export type StageStatus = 'live' | 'gated' | 'scaffold' | 'gap' | 'future';

export interface PipelineStage {
  n: number;
  title: string;
  status: StageStatus;
  statusLabel: string;
  extraStatus?: StageStatus;
  extraStatusLabel?: string;
  description: string;
  chips: string[];
  brokenMiddleAfter?: boolean;
}

export interface PipelineWalkthrough {
  updated: string;
  canonicalSource: string;
  headline: string;
  lede: string;
  thesis: string;
  tally: { status: StageStatus; label: string; count: number }[];
  legend: { status: StageStatus; label: string }[];
  stages: PipelineStage[];
  commandCenter: {
    title: string;
    heading: string;
    status: StageStatus;
    description: string;
    chips: string[];
    openNote: string;
  };
  footer: string;
}

export const pipelineWalkthrough = pipelineWalkthroughJson as PipelineWalkthrough;

/**
 * Legacy HTML is pulled in with Vite's `?raw` and loaded lazily, so a report
 * nobody opens adds nothing to the dashboard's first load. Keyed by slug; the
 * test pins that every legacy entry has one. Empty now that every library
 * entry renders natively — kept so a future non-HDS report has somewhere to
 * register a loader.
 */
export const LEGACY_LOADERS: Record<string, () => Promise<string>> = {};

export function entryHref(entry: Pick<LibraryEntry, 'slug' | 'render' | 'href'>): string {
  return entry.href ?? `/ops/library/${entry.slug}`;
}

export type SortKey = 'payoff' | 'name' | 'repo' | 'lines' | 'verdict' | 'effort' | 'cost';
export type SortDir = 'asc' | 'desc';

const EFFORT_ORDER: Record<string, number> = { S: 1, M: 2, L: 3 };

function sortValue(row: BvbSystem, key: SortKey): number | string {
  if (key === 'effort') return row.effort ? EFFORT_ORDER[row.effort] : Number.POSITIVE_INFINITY;
  const v = row[key];
  return typeof v === 'string' ? v.toLowerCase() : v;
}

/** Pure, non-mutating sort for the systems table. Unknown effort always sorts last. */
export function sortSystems(rows: readonly BvbSystem[], key: SortKey, dir: SortDir): BvbSystem[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (key === 'effort' && (x === Number.POSITIVE_INFINITY || y === Number.POSITIVE_INFINITY)) {
      return x === y ? 0 : x === Number.POSITIVE_INFINITY ? 1 : -1;
    }
    if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y) * sign;
    return ((x as number) - (y as number)) * sign;
  });
}
