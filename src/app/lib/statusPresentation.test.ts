import { describe, it, expect } from 'vitest';
import { statusTone, statusLabel } from './statusPresentation';

describe('statusTone', () => {
  it('maps known phase statuses', () => {
    expect(statusTone('done')).toBe('success');
    expect(statusTone('in-progress')).toBe('warning');
    expect(statusTone('blocked')).toBe('danger');
    expect(statusTone('planned')).toBe('info');
  });
  it('falls back to neutral for unknown / undefined', () => {
    expect(statusTone('whatever')).toBe('neutral');
    expect(statusTone(undefined)).toBe('neutral');
  });
});

describe('statusLabel', () => {
  it('uses operator wording by default', () => {
    expect(statusLabel('blocked')).toBe('Blocked');
    expect(statusLabel('scaffolded')).toBe('Scaffolded');
    expect(statusLabel('in-progress')).toBe('In Progress');
  });
  it('softens to client wording on request', () => {
    expect(statusLabel('blocked', 'client')).toBe('Waiting on you');
    expect(statusLabel('scaffolded', 'client')).toBe('Built, awaiting access');
    expect(statusLabel('todo', 'client')).toBe('Not started');
  });
  it('falls back to the raw status, then an em-dash', () => {
    expect(statusLabel('mystery')).toBe('mystery');
    expect(statusLabel(undefined, 'client')).toBe('—');
  });
});
