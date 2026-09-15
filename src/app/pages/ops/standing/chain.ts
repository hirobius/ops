/**
 * chain — the eight links that turn a lead into a paid site, and what each one
 * is actually worth today.
 *
 * This is editorial state, not telemetry: a link's `built` figure moves when a
 * decision or a merge changes the funnel, not on a poll. `docs/ARCHITECTURE.md`
 * §"Pipeline gap-map" is canonical; this module and
 * `docs/pipeline-walkthrough.html` are its two renderings and move in the same
 * commit (CLAUDE.md §1).
 *
 * Why a `built` percentage AND a state: the percentage says how much of a link
 * exists, the state says whether it passes anything through. ⑤ is 90% built and
 * passes nothing, because ④ upstream is severed — an average over the eight
 * would read ~56% and hide exactly the fact that matters.
 */

/**
 * - `live`    — proven in production.
 * - `partial` — built, held back by a key, a migration, or an upstream break.
 * - `cut`     — the link is broken; nothing crosses it.
 * - `absent`  — not built at all.
 */
export type LinkState = 'live' | 'partial' | 'cut' | 'absent';

export interface ChainLink {
  /** 1-based position in the funnel. The order carries the dependency. */
  n: number;
  name: string;
  state: LinkState;
  /** How much of this link exists, 0–100. Not how much flows through it. */
  built: number;
  note: string;
  /** Issue numbers in hirobius/ops that move this link. */
  issues: readonly number[];
}

export const CHAIN: readonly ChainLink[] = [
  {
    n: 1,
    name: 'Find leads',
    state: 'live',
    built: 100,
    note: 'Proven. Run 01 pulled 249 leads, 25 qualified. Outscraper spend is on hold by choice.',
    issues: [],
  },
  {
    n: 2,
    name: 'Score them',
    state: 'live',
    built: 80,
    note: 'Live at ≥60. The third scorer — site quality — waits on a PageSpeed key and migration 0006.',
    issues: [],
  },
  {
    n: 3,
    name: 'Generate a site',
    state: 'partial',
    built: 60,
    note: 'Runs enrich → generate → judge and emits a paste-ready client.config.ts. Never once run against a real lead.',
    issues: [186, 188, 191, 196],
  },
  {
    n: 4,
    name: 'Publish it',
    state: 'cut',
    built: 20,
    note: 'Mid-cutover, Duda → Astro. There is no working path from a config to a live URL.',
    issues: [187, 309],
  },
  {
    n: 5,
    name: 'Preview link',
    state: 'partial',
    built: 90,
    note: 'Portal built and authed. Idle until ④ produces something to preview.',
    issues: [44],
  },
  {
    n: 6,
    name: 'Cold email',
    state: 'partial',
    built: 35,
    note: 'Scaffolded, dry-run by default. Needs a Smartlead key, a warmed domain, and compliance cleared.',
    issues: [9],
  },
  {
    n: 7,
    name: 'Track the deal',
    state: 'partial',
    built: 60,
    note: 'CRM lifecycle built. Migration 0007 unapplied; the privacy page is still missing.',
    issues: [35, 38],
  },
  {
    n: 8,
    name: 'Invoice',
    state: 'absent',
    built: 0,
    note: 'Not started. There is no way to take money today.',
    issues: [200],
  },
] as const;

export interface ChainSummary {
  /** Mean of `built` across every link. Flattering, and the wrong number to lead with. */
  averageBuilt: number;
  /** What actually reaches the far end: a chain is its weakest link, not its mean. */
  throughput: number;
  /** The earliest link that passes nothing through — the one worth fixing first. */
  firstBreak: ChainLink | null;
}

const BLOCKING: ReadonlySet<LinkState> = new Set<LinkState>(['cut', 'absent']);

export function chainSummary(links: readonly ChainLink[]): ChainSummary {
  if (links.length === 0) return { averageBuilt: 0, throughput: 0, firstBreak: null };

  const total = links.reduce((sum, l) => sum + l.built, 0);
  const ordered = [...links].sort((a, b) => a.n - b.n);

  return {
    averageBuilt: Math.round(total / links.length),
    throughput: ordered.reduce((lowest, l) => Math.min(lowest, l.built), 100),
    firstBreak: ordered.find((l) => BLOCKING.has(l.state)) ?? null,
  };
}
