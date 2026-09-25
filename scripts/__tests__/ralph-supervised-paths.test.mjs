import { describe, it, expect } from 'vitest';
import { SUPERVISED_PATHS } from '../ralph-supervised-paths.mjs';
import { REVENUE_PATH_PREFIXES } from '../metric-north-star-share.mjs';
import { BOUNDARY_SELF_PATHS } from '../ralph-watchdog.mjs';

describe('ralph-supervised-paths: publishes the ops#238 boundary, verbatim', () => {
  it('deep-equals the union of the two imported arrays, in order', () => {
    expect(SUPERVISED_PATHS).toEqual([...REVENUE_PATH_PREFIXES, ...BOUNDARY_SELF_PATHS]);
  });

  it('includes itself, since publishing this list is itself a supervised edit', () => {
    expect(BOUNDARY_SELF_PATHS).toContain('scripts/ralph-supervised-paths.mjs');
  });
});
