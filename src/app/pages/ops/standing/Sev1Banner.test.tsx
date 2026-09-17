/**
 * Sev1Banner — the /ops/standing call-out for open sev1 issues (ops#317).
 *
 * The contract: an open sev1 is never one line among fifty. When any exist the
 * page leads with them, each linked, with what sev1 means spelled out; when
 * none exist the banner is absent rather than an empty box.
 *
 * @testing-library/react is not installed; tests use act + createRoot directly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FleetIssue } from '../ralphStatus';
import { Sev1Banner } from './Sev1Banner';

const PII: FleetIssue = {
  repo: 'hirobius/ops',
  number: 27,
  title: 'security: rewrite git history to purge client PII from the public repo',
  url: 'https://github.com/hirobius/ops/issues/27',
  label: 'sev1',
  prio: 'p1',
};

const HDS: FleetIssue = {
  repo: 'hirobius/hds',
  number: 4,
  title: 'a fire in the design system',
  url: 'https://github.com/hirobius/hds/issues/4',
  label: 'sev1',
  prio: null,
};

describe('Sev1Banner', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders nothing when no sev1 is open', () => {
    act(() => root.render(<Sev1Banner sev1={[]} />));
    expect(container.innerHTML).toBe('');
  });

  it('leads with a labelled region naming how many sev1 are open', () => {
    act(() => root.render(<Sev1Banner sev1={[PII, HDS]} />));
    const region = container.querySelector('section');
    expect(region).not.toBeNull();
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toMatch(/sev1/i);
    expect(region?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(container.textContent).toContain('2 open');
  });

  it('links every open sev1 to its issue, with repo and priority', () => {
    act(() => root.render(<Sev1Banner sev1={[PII, HDS]} />));
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([PII.url, HDS.url]);
    expect(links[0].textContent).toContain('#27');
    expect(links[0].textContent).toContain('purge client PII');
    expect(container.textContent).toContain('ops · p1');
    expect(container.textContent).toContain('hds');
  });

  it('spells out what sev1 means and that it stays until closed or accepted', () => {
    act(() => root.render(<Sev1Banner sev1={[PII]} />));
    expect(container.textContent).toContain(
      'Legal exposure, security incident, data loss, or already affecting a real third party',
    );
    expect(container.textContent).toMatch(/closed or explicitly accepted/);
    expect(container.textContent).toContain('1 open');
  });
});
