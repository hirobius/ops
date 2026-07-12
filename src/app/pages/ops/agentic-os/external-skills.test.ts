/**
 * Tests for external-skills.ts — catalog invariants for the design-toolkit
 * surface (/ops/skills). The catalog is checked-in data; these tests pin the
 * shape every tile relies on and regression-pin the session's fixed decisions.
 */

import { describe, it, expect } from 'vitest';
import { EXTERNAL_SKILLS, KIND_LABEL, STATUS_LABEL } from './external-skills';

describe('EXTERNAL_SKILLS catalog invariants', () => {
  it('has unique ids', () => {
    const ids = EXTERNAL_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a kind and status with display labels', () => {
    for (const s of EXTERNAL_SKILLS) {
      expect(KIND_LABEL[s.kind]).toBeTruthy();
      expect(STATUS_LABEL[s.status]).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.source).toBeTruthy();
      expect(s.description).toBeTruthy();
    }
  });

  it('every invocation command is non-empty and single-line', () => {
    for (const s of EXTERNAL_SKILLS) {
      for (const inv of s.invocations) {
        expect(inv.label).toBeTruthy();
        expect(inv.command.trim().length).toBeGreaterThan(0);
        expect(inv.command).not.toMatch(/\n/);
      }
    }
  });

  it('installed entries name at least one fleet repo; others carry a note', () => {
    for (const s of EXTERNAL_SKILLS) {
      if (s.status === 'installed') {
        expect(s.installedIn.length).toBeGreaterThan(0);
      } else {
        // cli-only / external entries must explain themselves (overlap, cost, auth)
        expect(s.note).toBeTruthy();
      }
    }
  });

  it('pins the fixed decisions: impeccable in hds+site-engine, shadcn in hds, Mobbin external', () => {
    const impeccable = EXTERNAL_SKILLS.find((s) => s.id === 'impeccable');
    expect(impeccable?.installedIn).toEqual(['hds', 'site-engine']);

    const shadcn = EXTERNAL_SKILLS.find((s) => s.id === 'shadcn-skill');
    expect(shadcn?.status).toBe('installed');
    expect(shadcn?.installedIn).toEqual(['hds']);

    const mobbin = EXTERNAL_SKILLS.find((s) => s.id === 'mobbin-mcp');
    expect(mobbin?.kind).toBe('mcp');
    expect(mobbin?.status).toBe('external');
    // Paid + interactive-OAuth caveat must stay surfaced to the user
    expect(mobbin?.note).toMatch(/paid/i);
  });
});
