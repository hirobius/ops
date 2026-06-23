/**
 * agentic-os/skills.ts — skill catalog + runSkill() fetch wrapper.
 *
 * Mirrors the server-side whitelist in
 * scripts/skill-runner-middleware.mjs. The labels + hints render in the
 * dashboard SkillsBar; the IDs match both ends so the buttons are
 * spec-driven, not magic strings.
 */

export type SkillId =
  | 'closure-plan'
  | 'strength'
  | 'firing-stats'
  | 'audit-claims'
  | 'verify-head'
  | 'snapshot-orch'
  | 'list-eligible'
  | 'triage-approved'
  | 'audit-sidecar'
  | 'tokens-index'
  | 'llms-generate'
  | 'figma-audit'
  | 'figma-vars'
  | 'convert-assets'
  | 'record-health'
  | 'changelog'
  | 'parse-bookmarks'
  | 'research-list'
  | 'research-run'
  | 'sales-pipeline'
  | 'sales-proposal'
  | 'meeting-to-tasks'
  | 'client-digest'
  | 'activity-log'
  | 'case-study-draft'
  | 'promote-to-core';

export type SkillGroup = 'Build' | 'Ops' | 'Knowledge' | 'Sales' | 'Client' | 'Self';

/**
 * Input-shell variants for skills that need one user-supplied argument
 * before firing. The SkillTile renders the appropriate control inline and
 * disables the fire button until the input is non-empty. The value is
 * substituted into the server-side argv at any `${input}` placeholder.
 *
 * Refs: t_554cd532 / dashbd-skillsbar-input-shell
 */
export type SkillInputKind = 'text' | 'url' | 'file' | 'slug';

export interface SkillInput {
  kind: SkillInputKind;
  label: string;
  placeholder?: string;
}

export interface SkillSpec {
  id: SkillId;
  label: string;
  hint: string;
  group: SkillGroup;
  /** When true, the response's `parsedOutput` is rendered inline. */
  showJsonResult: boolean;
  /** When defined, the tile renders an input control before the fire button. */
  input?: SkillInput;
}

export const SKILLS: SkillSpec[] = [
  // Build — AI-powered build skills
  {
    id: 'promote-to-core',
    label: 'Promote to core',
    hint: 'lab/<slug> → components/',
    group: 'Build',
    showJsonResult: false,
    input: {
      kind: 'slug',
      label: 'Component slug',
      placeholder: 'token-list',
    },
  },
  // Build — creator-facing artefact regen
  {
    id: 'tokens-index',
    label: 'Tokens index',
    hint: 'rebuild token-usage map',
    group: 'Build',
    showJsonResult: false,
  },
  {
    id: 'llms-generate',
    label: 'LLMs map',
    hint: 'rebuild public/llms.txt',
    group: 'Build',
    showJsonResult: false,
  },
  {
    id: 'figma-audit',
    label: 'Figma audit',
    hint: 'repo ↔ Figma drift',
    group: 'Build',
    showJsonResult: false,
  },
  {
    id: 'figma-vars',
    label: 'Figma vars',
    hint: 'rebuild Figma variables',
    group: 'Build',
    showJsonResult: false,
  },
  {
    id: 'convert-assets',
    label: 'Convert assets',
    hint: '_incoming → WebP/AVIF',
    group: 'Build',
    showJsonResult: false,
  },
  // Ops — repo + agent ops
  {
    id: 'list-eligible',
    label: 'List eligible',
    hint: 'queue ready to dispatch',
    group: 'Ops',
    showJsonResult: true,
  },
  {
    id: 'triage-approved',
    label: 'Triage approved',
    hint: 'sift the approved bucket',
    group: 'Ops',
    showJsonResult: true,
  },
  {
    id: 'audit-claims',
    label: 'Audit claims',
    hint: 'detect stale claims',
    group: 'Ops',
    showJsonResult: true,
  },
  {
    id: 'verify-head',
    label: 'Verify HEAD',
    hint: 'pre-commit gates',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'closure-plan',
    label: 'Closure plan',
    hint: 'rebuild full-strictness map',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'strength',
    label: 'Strength',
    hint: 'regenerate Score A + B',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'firing-stats',
    label: 'Firing stats',
    hint: 'gate firing summary',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'snapshot-orch',
    label: 'Snapshot orch',
    hint: 'archive orchestration.json',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'audit-sidecar',
    label: 'Audit sidecar',
    hint: 'audit token sidecars',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'record-health',
    label: 'Record health',
    hint: 'snapshot health-history',
    group: 'Ops',
    showJsonResult: false,
  },
  {
    id: 'changelog',
    label: 'Changelog',
    hint: 'rebuild CHANGELOG.md',
    group: 'Ops',
    showJsonResult: false,
  },
  // Sales — pipeline + proposals
  {
    id: 'sales-pipeline',
    label: 'Pipeline',
    hint: 'overdue + next-touch',
    group: 'Sales',
    showJsonResult: true,
  },
  {
    id: 'sales-proposal',
    label: 'Proposal price',
    hint: 'scope → tiered quote',
    group: 'Sales',
    showJsonResult: false,
    input: {
      kind: 'text',
      label: 'Scope notes',
      placeholder: 'Paste scope, requirements, hints (pages, ecommerce, ongoing…)',
    },
  },
  // Client — meeting → tasks, weekly digest
  {
    id: 'meeting-to-tasks',
    label: 'Meeting → tasks',
    hint: 'transcript → proposed units',
    group: 'Client',
    showJsonResult: false,
    input: {
      kind: 'slug',
      label: 'Transcript path',
      placeholder: 'transcripts/2026-05-11.txt',
    },
  },
  {
    id: 'client-digest',
    label: 'Client digest',
    hint: 'weekly status draft',
    group: 'Client',
    showJsonResult: false,
    input: {
      kind: 'slug',
      label: 'Client slug',
      placeholder: 'client-slug',
    },
  },
  // Self — recruiter-facing artefacts
  {
    id: 'activity-log',
    label: 'Activity log',
    hint: '7d git → markdown',
    group: 'Self',
    showJsonResult: false,
  },
  {
    id: 'case-study-draft',
    label: 'Case study draft',
    hint: 'notes → schema slot',
    group: 'Self',
    showJsonResult: false,
    input: {
      kind: 'slug',
      label: 'Notes path or client slug',
      placeholder: 'client-slug',
    },
  },
  // Knowledge — ingestion
  {
    id: 'parse-bookmarks',
    label: 'Parse bookmarks',
    hint: 'Chrome → BUILD/GROW/RUN',
    group: 'Knowledge',
    showJsonResult: false,
  },
  {
    id: 'research-list',
    label: 'Research list',
    hint: 'queries + finding counts',
    group: 'Knowledge',
    showJsonResult: true,
  },
  {
    id: 'research-run',
    label: 'Research run',
    hint: 'fire enabled queries now',
    group: 'Knowledge',
    showJsonResult: true,
  },
];

export interface SkillResponse {
  ok: boolean;
  timedOut?: boolean;
  exitCode?: number | null;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  parsedOutput?: unknown;
  error?: string;
}

export async function runSkill(id: SkillId, input?: string): Promise<SkillResponse> {
  const start = Date.now();
  const hasInput = typeof input === 'string' && input.length > 0;
  const init: RequestInit = hasInput
    ? {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      }
    : { method: 'POST' };
  try {
    const res = await fetch(`/api/skills/${id}`, init);
    const body = (await res.json()) as SkillResponse;
    return body;
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
