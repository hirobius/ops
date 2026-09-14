/**
 * Pure decision helpers for the Leads board's site actions (#185).
 *
 * Kept out of LeadsPage.tsx so "which button does this lead get" is unit-testable
 * without mounting the page — same pattern as tasks/taskMeta.ts.
 *
 * Only `render` exists here by design. The board used to dispatch 'build' and
 * 'publish', which terminate in the retired Duda stub (retired 2026-06-30, see
 * docs/ARCHITECTURE.md) and fabricate preview/editor/live URLs. Nothing in this
 * module may return those actions — `siteActionFor` is the single gate, and its
 * test asserts the invariant.
 */
import type { Lead, LeadStatus } from './types';

export type BadgeTone = 'success' | 'neutral' | 'warning' | 'danger';

/** Badge tone per lead status. Exhaustive over LeadStatus so the page never falls back. */
export const STATUS_TONE: Record<LeadStatus, BadgeTone> = {
  sourced: 'neutral',
  generating: 'warning',
  scored: 'success',
  rendered: 'success',
  sent: 'success',
  won: 'success',
  lost: 'danger',
};

export interface SiteAction {
  /** The only action the board dispatches. Never 'build' or 'publish'. */
  kind: 'render';
  label: string;
}

/**
 * Which site action a lead should offer, or null for none.
 *
 * Rendering needs a generated config to render from, so it's offered once the
 * agent has produced one — signalled either by status 'scored' or by a non-null
 * `config` (status can lag the write). An already-rendered lead can re-render,
 * since regenerating the hand-off is cheap and non-destructive.
 */
export function siteActionFor(lead: Lead): SiteAction | null {
  const hasConfig = lead.status === 'scored' || lead.config != null;
  if (!hasConfig) return null;
  return { kind: 'render', label: lead.status === 'rendered' ? 'Re-render' : 'Render site' };
}

/** The paste-ready hand-off the `render` action returns. */
export interface RenderHandoff {
  /** Drop-in `client.config.ts` source. */
  configFile: string;
  /** Scaffold + deploy commands to run against the clients repo. */
  commands: string;
}

/**
 * Narrow an untyped `/api/lead-action` response to a usable hand-off.
 *
 * The route also returns 409 NO_CONFIG / 422 CONFIG_INVALID error bodies, so a
 * 200 shape is not assumed — the caller shows the copy blocks only when both
 * paste-ready parts are genuinely present.
 */
export function isRenderHandoff(body: unknown): body is RenderHandoff {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return typeof b['configFile'] === 'string' && typeof b['commands'] === 'string';
}
