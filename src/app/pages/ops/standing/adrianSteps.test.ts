import { describe, expect, it } from 'vitest';

import rawSteps from '../../../../../docs/ai/adrian-steps.json';
import { chores, guideUrl, stepsFor } from './adrianSteps';

interface RawStep {
  text: string;
  href?: string;
  copy?: string;
}

const data = rawSteps as {
  issues: Record<string, { steps: RawStep[] }>;
  chores: { id: string; steps: RawStep[] }[];
};

describe('stepsFor', () => {
  it('finds steps for a known issue keyed owner/repo#n', () => {
    const steps = stepsFor('hirobius/ops', 414);
    expect(steps).toBeDefined();
    expect(steps!.length).toBeGreaterThan(0);
  });

  it('normalises a bare repo name to hirobius/<repo>', () => {
    const full = stepsFor('hirobius/ops', 321);
    const bare = stepsFor('ops', 321);
    expect(bare).toEqual(full);
  });

  it('returns undefined for an issue the guide has nothing on', () => {
    expect(stepsFor('hirobius/ops', 999999)).toBeUndefined();
  });

  it('returns undefined for an unknown repo entirely', () => {
    expect(stepsFor('hirobius/does-not-exist', 1)).toBeUndefined();
  });
});

describe('guideUrl', () => {
  it('is a non-empty URL', () => {
    expect(typeof guideUrl).toBe('string');
    expect(guideUrl.length).toBeGreaterThan(0);
    expect(guideUrl.startsWith('https://')).toBe(true);
  });
});

describe('chores', () => {
  it('has at least one chore', () => {
    expect(chores.length).toBeGreaterThan(0);
  });

  it('every chore has a non-empty id, title and at least one step', () => {
    for (const chore of chores) {
      expect(chore.id.length, 'id').toBeGreaterThan(0);
      expect(chore.title.length, 'title').toBeGreaterThan(0);
      expect(chore.steps.length, `${chore.id} steps`).toBeGreaterThan(0);
    }
  });

  it('has unique chore ids', () => {
    const ids = chores.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('every step in the data set', () => {
  // Reads the raw JSON directly so this test covers every issue entry too,
  // not just the ones exercised above by stepsFor.
  const allSteps = [
    ...Object.entries(data.issues).flatMap(([key, v]) =>
      v.steps.map((step) => ({ label: key, step })),
    ),
    ...data.chores.flatMap((c) => c.steps.map((step) => ({ label: c.id, step }))),
  ];

  it('has at least one step to check', () => {
    expect(allSteps.length).toBeGreaterThan(0);
  });

  it('no step lacks text', () => {
    for (const { label, step } of allSteps) {
      expect(typeof step.text, label).toBe('string');
      expect(step.text.trim().length, label).toBeGreaterThan(0);
    }
  });

  it('every href is a non-empty string when present', () => {
    for (const { label, step } of allSteps) {
      if (step.href === undefined) continue;
      expect(typeof step.href, label).toBe('string');
      expect(step.href.trim().length, label).toBeGreaterThan(0);
    }
  });

  it('every copy is a non-empty string when present', () => {
    for (const { label, step } of allSteps) {
      if (step.copy === undefined) continue;
      expect(typeof step.copy, label).toBe('string');
      expect(step.copy.trim().length, label).toBeGreaterThan(0);
    }
  });
});
