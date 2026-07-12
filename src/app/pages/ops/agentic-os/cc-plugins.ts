/**
 * agentic-os/cc-plugins.ts — types + fetch wrapper for GET /api/cc-plugins.
 * Mirrors the skills.ts pattern for the internal script catalog.
 *
 * Prod fallback (2026-07-12): /api/cc-plugins is DEV-ONLY Vite middleware
 * (scripts/cc-plugins-middleware.mjs) — on Vercel the fetch gets the SPA
 * shell and json() throws, so PluginsBar rendered empty in production. The
 * repo's own committed `.claude/skills/<id>/SKILL.md` files are now baked in at
 * build time (same import.meta.glob idiom as RunsPanel/FleetTimeline) and
 * used whenever the live endpoint yields nothing. Dev keeps the middleware
 * (it also sees ~/.claude global skills, which a build can't).
 */

export interface CcSkill {
  name: string;
  description: string;
  invocation: string;
  source: 'global' | 'project';
}

interface CcPluginsResponse {
  skills: CcSkill[];
}

// ── Build-time static manifest of the repo's committed project skills ────────
const skillMdGlob = import.meta.glob<string>('../../../../../.claude/skills/*/SKILL.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

/**
 * Minimal SKILL.md frontmatter parse — single-line `name:` / `description:`
 * values, same tolerance as the dev middleware's regex parser.
 */
export function parseSkillMd(raw: string): { name: string; description: string } | null {
  const fm = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const pick = (key: string): string => {
    const m = fm[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
  };
  const name = pick('name');
  if (!name) return null;
  return { name, description: pick('description') };
}

export function staticProjectSkills(glob: Record<string, string> = skillMdGlob): CcSkill[] {
  const skills: CcSkill[] = [];
  for (const raw of Object.values(glob)) {
    const parsed = parseSkillMd(raw);
    if (!parsed) continue;
    skills.push({
      name: parsed.name,
      description: parsed.description,
      invocation: `claude /${parsed.name}`,
      source: 'project',
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchCcSkills(): Promise<CcSkill[]> {
  try {
    const res = await fetch('/api/cc-plugins');
    const body = (await res.json()) as CcPluginsResponse;
    const live = body.skills ?? [];
    if (live.length > 0) return live;
    return staticProjectSkills();
  } catch {
    return staticProjectSkills();
  }
}
