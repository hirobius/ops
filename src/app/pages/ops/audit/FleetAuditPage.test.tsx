/**
 * FleetAuditPage — guards the HDS migration (ops#425): the build-health state
 * is still announced to assistive tech (via VisuallyHidden, not a hand-rolled
 * clip), the colour dot maps each state to a semantic tone, and every section
 * heading id still resolves from its aria-labelledby.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

import auditData from '../../../../../docs/ai/fleet-audit.json';
import FleetAuditPage from './FleetAuditPage';

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MemoryRouter>
        <FleetAuditPage />
      </MemoryRouter>,
    );
  });
  return container;
}

const TONE: Record<string, string> = { green: 'success', risk: 'warning', red: 'danger' };

describe('FleetAuditPage', () => {
  it('announces each build-health state through a visually-hidden label', () => {
    const c = render();
    const rows = auditData.audits[0].buildHealth;
    const hidden = [...c.querySelectorAll('.sr-only')].map((n) => n.textContent);
    for (const row of rows) expect(hidden).toContain(` — ${row.state}`);
  });

  it('renders a decorative status dot whose tone matches each state', () => {
    const c = render();
    const tones = [...c.querySelectorAll('[data-tone]')].map((n) => n.getAttribute('data-tone'));
    const expected = auditData.audits.flatMap((a) => a.buildHealth.map((r) => TONE[r.state]));
    expect(tones).toEqual(expected);
  });

  it('points every section aria-labelledby at an existing heading', () => {
    const c = render();
    const sections = [...c.querySelectorAll('section[aria-labelledby]')];
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      const heading = document.getElementById(s.getAttribute('aria-labelledby')!);
      expect(heading?.tagName).toBe('H3');
    }
  });
});
