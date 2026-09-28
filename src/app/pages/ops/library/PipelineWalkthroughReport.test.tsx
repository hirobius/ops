/**
 * PipelineWalkthroughReport — guards the HDS migration (ops#425): the stage
 * tally keeps its accessible group label, each section's aria-labelledby still
 * resolves to an h2, every stage renders as a divided band with its chips, and
 * the "broken middle" marker still follows the flagged stage.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';

import { pipelineWalkthrough } from './libraryData';
import PipelineWalkthroughReport from './PipelineWalkthroughReport';

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(
      <MemoryRouter>
        <PipelineWalkthroughReport />
      </MemoryRouter>,
    );
  });
  return container;
}

describe('PipelineWalkthroughReport', () => {
  it('labels the stage tally as a group with one badge per tally entry', () => {
    const c = render();
    const group = c.querySelector('[role="group"][aria-label="Stage tally"]');
    expect(group).not.toBeNull();
    for (const t of pipelineWalkthrough.tally) {
      expect(group!.textContent).toContain(`${t.count} ${t.label}`);
    }
  });

  it('points every section aria-labelledby at an existing h2', () => {
    const c = render();
    const sections = [...c.querySelectorAll('section[aria-labelledby]')];
    expect(sections).toHaveLength(2);
    for (const s of sections) {
      const heading = document.getElementById(s.getAttribute('aria-labelledby')!);
      expect(heading?.tagName).toBe('H2');
    }
  });

  it('renders every stage chip and the broken-middle marker once', () => {
    const c = render();
    const text = c.textContent ?? '';
    for (const stage of pipelineWalkthrough.stages) {
      for (const chip of stage.chips) expect(text).toContain(chip);
    }
    const flagged = pipelineWalkthrough.stages.filter((s) => s.brokenMiddleAfter).length;
    expect(text.split('↑ the broken middle').length - 1).toBe(flagged);
  });

  it('separates each stage band and the footer with an HDS Divider', () => {
    const c = render();
    expect(c.querySelectorAll('hr')).toHaveLength(pipelineWalkthrough.stages.length + 1);
  });

  it('closes with a footer carrying the canonical-source note', () => {
    const c = render();
    expect(c.querySelector('footer')?.textContent).toContain(pipelineWalkthrough.footer);
  });
});
