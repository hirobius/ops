/**
 * Tests for cc-plugins.ts — the prod static-manifest fallback (2026-07-12).
 *
 * Covers:
 *   - parseSkillMd extracts name/description from SKILL.md frontmatter
 *   - staticProjectSkills maps a glob to sorted project-source CcSkills
 *   - fetchCcSkills falls back to the static manifest when the endpoint is
 *     absent (prod: fetch resolves with SPA HTML → json() throws)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseSkillMd, staticProjectSkills, fetchCcSkills } from './cc-plugins';

const TDD_MD = `---
name: tdd
description: Test-driven development. Use when building test-first.
---

# TDD
`;

describe('parseSkillMd', () => {
  it('extracts name and description from frontmatter', () => {
    expect(parseSkillMd(TDD_MD)).toEqual({
      name: 'tdd',
      description: 'Test-driven development. Use when building test-first.',
    });
  });

  it('returns null without frontmatter or name', () => {
    expect(parseSkillMd('# no frontmatter')).toBeNull();
    expect(parseSkillMd('---\ndescription: only\n---\n')).toBeNull();
  });
});

describe('staticProjectSkills', () => {
  it('maps a glob to sorted project-source skills with claude invocations', () => {
    const skills = staticProjectSkills({
      'z/SKILL.md': TDD_MD,
      'a/SKILL.md': `---\nname: code-review\ndescription: Review changes.\n---\n`,
    });
    expect(skills.map((s) => s.name)).toEqual(['code-review', 'tdd']);
    expect(skills[1]).toMatchObject({ invocation: 'claude /tdd', source: 'project' });
  });

  it('reads the repo manifest at build time — committed skills are present', () => {
    const names = staticProjectSkills().map((s) => s.name);
    expect(names).toContain('tdd');
    expect(names).toContain('code-review');
  });
});

describe('fetchCcSkills prod fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the static manifest when json() throws (SPA shell)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('not json')),
        } as unknown as Response),
      ),
    );
    const skills = await fetchCcSkills();
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.every((s) => s.source === 'project')).toBe(true);
  });

  it('prefers live endpoint results when present', async () => {
    const live = [{ name: 'x', description: 'd', invocation: 'claude /x', source: 'global' }];
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ skills: live }) } as Response),
      ),
    );
    expect(await fetchCcSkills()).toEqual(live);
  });
});
