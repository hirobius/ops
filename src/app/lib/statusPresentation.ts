/**
 * statusPresentation — domain status → Badge tone + human label.
 *
 * The shared phase/client-status vocabulary used by ClientDashboardPage (operator
 * view) and ClientReportPage (client-facing report). Consolidates the tone map
 * (identical across both pages) and the two label sets behind one interface so a
 * new status or a wording change lands once. (Candidate #7.)
 *
 * Deliberately NOT used by the task / lead / account / roadmap / brand-audit
 * surfaces: those are DIFFERENT status vocabularies whose tones intentionally
 * differ (e.g. 'blocked' is danger here but warning on the Tasks board and the
 * Roadmap), so merging them would change how those screens render. Left as-is.
 *
 * `BadgeTone` mirrors the design system's Badge `tone` prop. The DS doesn't export
 * that union yet (~12 ops files redeclare it by hand) — see docs/ai/ds-handoff.md;
 * once the DS exports it, import it from there and drop this local copy.
 */
export type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';
export type StatusAudience = 'operator' | 'client';

const TONE: Record<string, BadgeTone> = {
  done: 'success',
  complete: 'success',
  'in-progress': 'warning',
  blocked: 'danger',
  'not-started': 'neutral',
  planned: 'info',
  evaluating: 'info',
  todo: 'neutral',
  'agreed-verbal': 'info',
  prospect: 'info',
  'pro-bono': 'neutral',
  'phase-2-candidate': 'info',
  'pending-activation': 'warning',
  'pending-access': 'warning',
  unknown: 'neutral',
  deferred: 'neutral',
  'api-unknown': 'neutral',
  scaffolded: 'info',
};

/** Operator-facing labels (the internal /ops client dashboard). */
const OPERATOR_LABEL: Record<string, string> = {
  done: 'Done',
  complete: 'Done',
  'in-progress': 'In Progress',
  blocked: 'Blocked',
  'not-started': 'Not Started',
  planned: 'Planned',
  todo: 'To Do',
  evaluating: 'Evaluating',
  'agreed-verbal': 'Verbal Agreed',
  prospect: 'Prospect',
  'pro-bono': 'Pro Bono',
  'phase-2-candidate': 'Phase 2 Candidate',
  'pending-activation': 'Pending Activation',
  'pending-access': 'Pending Access',
  scaffolded: 'Scaffolded',
  deferred: 'Deferred',
  unknown: 'Unknown',
  'api-unknown': 'API Unknown',
};

/** Client-facing translation (the bookmarkable weekly report — plain language). */
const CLIENT_LABEL: Record<string, string> = {
  done: 'Done',
  complete: 'Done',
  'in-progress': 'In progress',
  blocked: 'Waiting on you',
  'not-started': 'Not started',
  todo: 'Not started',
  planned: 'Planned',
  evaluating: 'Evaluating',
  scaffolded: 'Built, awaiting access',
  'pending-access': 'Awaiting access',
  'pending-activation': 'Awaiting activation',
  deferred: 'Deferred',
  unknown: 'Unknown',
  'phase-2-candidate': 'Planned for Phase 2',
};

/** Badge tone for a phase/client status (neutral if unknown). */
export function statusTone(status: string | undefined): BadgeTone {
  return TONE[status ?? ''] ?? 'neutral';
}

/** Human label for a status — operator wording by default, client wording on request. */
export function statusLabel(status: string | undefined, audience: StatusAudience = 'operator'): string {
  const table = audience === 'client' ? CLIENT_LABEL : OPERATOR_LABEL;
  return table[status ?? ''] ?? status ?? '—';
}
