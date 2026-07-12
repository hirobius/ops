/**
 * agentic-os/external-skills.ts — checked-in static catalog of the external
 * design-quality toolkit adopted across the fleet (2026-07-12 session).
 *
 * Deliberately NOT fetched: a curated catalog is the only honest source for
 * what's installed in *other* repos (hds, site-engine) plus external CLIs and
 * MCP servers, and a static module renders identically in dev and prod with
 * zero api/* function slots (Vercel Hobby cap). Mirrors the skills.ts /
 * cc-plugins.ts module style.
 */

export type CatalogKind = 'skill' | 'cli' | 'mcp';

export type CatalogStatus = 'installed' | 'cli-only' | 'external';

export interface CatalogInvocation {
  label: string;
  command: string;
}

export interface ExternalSkill {
  id: string;
  name: string;
  kind: CatalogKind;
  status: CatalogStatus;
  /** Fleet repos where the skill is vendored/pinned (skills-lock.json). */
  installedIn: readonly ('hds' | 'site-engine' | 'ops')[];
  /** Upstream provenance, e.g. 'pbakaus/impeccable' or 'npm:skillui'. */
  source: string;
  description: string;
  /** Copyable commands — run in Claude Code (or a shell for CLIs). */
  invocations: readonly CatalogInvocation[];
  /** Caveats, overlaps, why-nots — rendered in the expanded panel. */
  note?: string;
}

export const KIND_LABEL: Record<CatalogKind, string> = {
  skill: 'Claude Code skill',
  cli: 'CLI',
  mcp: 'MCP server',
};

export const STATUS_LABEL: Record<CatalogStatus, string> = {
  installed: 'Installed in fleet',
  'cli-only': 'Run ad hoc',
  external: 'External connector',
};

export const EXTERNAL_SKILLS: readonly ExternalSkill[] = [
  {
    id: 'impeccable',
    name: 'Impeccable',
    kind: 'skill',
    status: 'installed',
    installedIn: ['hds', 'site-engine'],
    source: 'pbakaus/impeccable',
    description:
      'Design guidance for AI agents — command-driven critique/polish passes plus 46 deterministic anti-pattern detector rules (no LLM, no key).',
    invocations: [
      { label: 'Review a surface', command: '/impeccable critique <target>' },
      { label: 'Pre-ship fix pass', command: '/impeccable polish <target>' },
      { label: 'A11y / perf / responsive audit', command: '/impeccable audit <target>' },
      { label: 'Edge-case hardening', command: '/impeccable harden <target>' },
      { label: 'Typography pass', command: '/impeccable typeset <target>' },
      { label: 'Layout / spacing pass', command: '/impeccable layout <target>' },
      {
        label: 'Deterministic sweep (hds guardrail: check-impeccable-detect)',
        command: 'npx impeccable detect <dir>',
      },
    ],
    note: 'Curated subset pinned via skills-lock.json (Apache-2.0, pinned commit). Commands outside the six above (e.g. animate, delight) are intentionally not vendored — add the reference file at the pin first.',
  },
  {
    id: 'shadcn-skill',
    name: 'shadcn skill',
    kind: 'skill',
    status: 'installed',
    installedIn: ['hds'],
    source: 'shadcn-ui/ui',
    description:
      'Official shadcn/ui skill — component composition, registry search, and styling rules. HDS is shadcn-oriented per hds ADR-001 (distribution model: copy-the-code + Radix + Tailwind).',
    invocations: [
      { label: 'Search component registries', command: 'npx shadcn@latest search <query>' },
      { label: 'Component docs + examples', command: 'npx shadcn@latest docs <component>' },
      { label: 'Add a component', command: 'npx shadcn@latest add <component>' },
    ],
    note: 'The skill auto-loads in Claude Code sessions inside hds. It reads components.json for project detection — hds has none yet (open decision), so project-awareness features are inert there for now.',
  },
  {
    id: 'skillui',
    name: 'SkillUI',
    kind: 'cli',
    status: 'cli-only',
    installedIn: [],
    source: 'npm:skillui',
    description:
      'Reverse-engineers any site or repo into a Claude-ready design-system skill (tokens, fonts, screenshots, SKILL.md) via pure static analysis — useful for extracting a prospect’s existing brand before a rebuild.',
    invocations: [
      { label: 'Extract from a live site', command: 'npx skillui --url <prospect-site>' },
      { label: 'Check flags first', command: 'npx skillui --help' },
    ],
    note: 'Generator CLI, deliberately not vendored. Overlaps the pinned extract-design skill (skills-lock.json) and docs/ai/DESIGN_EXTRACT_GAP.md — bake-off tracked as a follow-up issue.',
  },
  {
    id: 'mobbin-mcp',
    name: 'Mobbin MCP',
    kind: 'mcp',
    status: 'external',
    installedIn: [],
    source: 'api.mobbin.com/mcp',
    description:
      'Design reference for agents — search 620k+ real app screens, flows, and saved collections directly from Claude while designing HDS components or site-engine sections.',
    invocations: [
      {
        label: 'Connect (one-time, then OAuth in browser)',
        command: 'claude mcp add mobbin --scope user --transport http https://api.mobbin.com/mcp',
      },
    ],
    note: 'Requires a paid Mobbin plan (Pro, ~$10/mo — needs-adrian) and interactive browser OAuth, so it serves interactive sessions only; Ralph/headless runs cannot authenticate.',
  },
] as const;
