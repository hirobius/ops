/**
 * agentic-os/cc-plugins.ts — types + fetch wrapper for GET /api/cc-plugins.
 * Mirrors the skills.ts pattern for the internal script catalog.
 */

export interface CcSkill {
  name:        string;
  description: string;
  invocation:  string;
  source:      'global' | 'project';
}

interface CcPluginsResponse {
  skills: CcSkill[];
}

export async function fetchCcSkills(): Promise<CcSkill[]> {
  try {
    const res  = await fetch('/api/cc-plugins');
    const body = await res.json() as CcPluginsResponse;
    return body.skills ?? [];
  } catch {
    return [];
  }
}
