/**
 * Tests for scripts/promote-to-core.mjs — Promotion Checklist + dry-run.
 *
 * Refs: t_be5c5b75 / AI Build skills bundle — promote-to-core
 */

import { describe, it, expect } from 'vitest';
import { runPromotionChecklist, summarize } from '../promote-to-core.mjs';

const cleanSource = `
import type { CSSProperties } from 'react';

export interface CleanCardProps {
  title: string;
}

export function CleanCard({ title }: CleanCardProps) {
  return (
    <div style={{ color: 'var(--semantic-color-content-primary)', padding: 'var(--primitive-space-2)' }}>
      {title}
    </div>
  );
}
`;

const dirtySource = `
export function DirtyCard({ title }) {
  return <div style={{ color: '#ff8800', padding: '24px' }}>{title}</div>;
}
`;

describe('runPromotionChecklist', () => {
  it('passes all 4 checks on a clean token-based component', () => {
    const r = runPromotionChecklist(cleanSource);
    expect(r.checks.length).toBe(4);
    expect(r.checks.every((c) => c.pass)).toBe(true);
  });

  it('flags raw hex colors', () => {
    const r = runPromotionChecklist(dirtySource);
    const hex = r.checks.find((c) => c.id === 'no-hex-colors');
    expect(hex.pass).toBe(false);
  });

  it('flags missing token usage when no var(--semantic|primitive-…) reference exists', () => {
    const r = runPromotionChecklist(dirtySource);
    const tokens = r.checks.find((c) => c.id === 'uses-tokens');
    expect(tokens.pass).toBe(false);
  });

  it('flags missing typed Props', () => {
    const r = runPromotionChecklist(dirtySource);
    const props = r.checks.find((c) => c.id === 'has-typed-props');
    expect(props.pass).toBe(false);
  });

  it('flags absence of export statements', () => {
    const r = runPromotionChecklist('const x = 1;\n');
    const xport = r.checks.find((c) => c.id === 'has-export');
    expect(xport.pass).toBe(false);
  });

  it('counts pass/total accurately', () => {
    const r = runPromotionChecklist(cleanSource);
    expect(r.pass).toBe(4);
    expect(r.total).toBe(4);
  });

  it('ignores hex inside line comments', () => {
    const src = cleanSource + '\n// brand reference: #FF8800 (do not use directly)';
    const r = runPromotionChecklist(src);
    expect(r.checks.find((c) => c.id === 'no-hex-colors').pass).toBe(true);
  });

  it('ignores hex inside block comments', () => {
    const src = cleanSource + '\n/* TODO: #abcdef placeholder note */';
    const r = runPromotionChecklist(src);
    expect(r.checks.find((c) => c.id === 'no-hex-colors').pass).toBe(true);
  });
});

describe('summarize', () => {
  it('returns a single-line OK summary when all checks pass', () => {
    const r = runPromotionChecklist(cleanSource);
    expect(summarize(r, 'CleanCard')).toMatch(/^CleanCard: 4\/4 checks pass/);
  });

  it('lists failing check ids on a fail line', () => {
    const r = runPromotionChecklist(dirtySource);
    const s = summarize(r, 'DirtyCard');
    expect(s).toMatch(/no-hex-colors/);
    expect(s).toMatch(/uses-tokens/);
  });
});
