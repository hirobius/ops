/**
 * Sev1Banner — the /ops/standing call-out for open sev1 issues (ops#317).
 *
 * The contract: an open sev1 is never one line among fifty. When any exist the
 * page leads with them, each linked, with what sev1 means spelled out. The
 * banner is absent ONLY when a real fleet payload arrived and it held no sev1 —
 * a failed or pending read must never look the same as an all-clear.
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

/** A fleet payload has arrived without error. */
const LOADED = { error: null, needsToken: false, loaded: true } as const;

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

  it('renders nothing when the fleet loaded and no sev1 is open', () => {
    act(() => root.render(<Sev1Banner sev1={[]} {...LOADED} />));
    expect(container.innerHTML).toBe('');
  });

  it('leads with a labelled region naming how many sev1 are open', () => {
    act(() => root.render(<Sev1Banner sev1={[PII, HDS]} {...LOADED} />));
    const region = container.querySelector('section');
    expect(region).not.toBeNull();
    const heading = container.querySelector('h2');
    expect(heading?.textContent).toMatch(/sev1/i);
    expect(region?.getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(container.textContent).toContain('2 open');
  });

  it('links every open sev1 to its issue, with repo and priority', () => {
    act(() => root.render(<Sev1Banner sev1={[PII, HDS]} {...LOADED} />));
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([PII.url, HDS.url]);
    expect(links[0].textContent).toContain('#27');
    expect(links[0].textContent).toContain('purge client PII');
    expect(container.textContent).toContain('ops · p1');
    expect(container.textContent).toContain('hds');
  });

  it('spells out what sev1 means, that it stays until closed, and that unlabelling needs a reason', () => {
    act(() => root.render(<Sev1Banner sev1={[PII]} {...LOADED} />));
    expect(container.textContent).toContain(
      'Legal exposure, security incident, data loss, or already affecting a real third party',
    );
    expect(container.textContent).toMatch(/until closed/);
    // There is no "accepted" state to point at — only closing, or unlabelling with a stated reason.
    expect(container.textContent).not.toMatch(/accepted/);
    expect(container.textContent).toMatch(/comment on the issue saying why/);
    expect(container.textContent).toContain('1 open');
  });

  // ── the read failed: UNKNOWN, never silence ──────────────────────────────

  it('reports sev1 status as UNKNOWN when the fleet read failed before anything loaded', () => {
    const error = 'GitHub fleet issue read failed (HTTP 502)';
    act(() =>
      root.render(<Sev1Banner sev1={[]} error={error} needsToken={false} loaded={false} />),
    );
    const region = container.querySelector('section');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-labelledby')).toBe(container.querySelector('h2')?.id);
    expect(container.textContent).toContain('UNKNOWN');
    expect(container.textContent).toContain(error);
    expect(container.textContent).toContain('pnpm sev1:check');
    expect(container.textContent).not.toMatch(/\d+ open/);
  });

  it('reports sev1 status as UNKNOWN when GITHUB_TOKEN is missing, with the server’s fix', () => {
    const error =
      'GITHUB_TOKEN not set — needed for the Ralph fleet panel. Add it in Vercel → Settings.';
    act(() => root.render(<Sev1Banner sev1={[]} error={error} needsToken loaded={false} />));
    expect(container.querySelector('section')).not.toBeNull();
    expect(container.textContent).toContain('UNKNOWN');
    expect(container.textContent).toContain(error);
    expect(container.textContent).toContain('pnpm sev1:check');
  });

  it('still reports UNKNOWN when the token is missing but no message came back', () => {
    act(() => root.render(<Sev1Banner sev1={[]} error={null} needsToken loaded={false} />));
    expect(container.textContent).toContain('UNKNOWN');
    expect(container.textContent).toContain('GITHUB_TOKEN');
  });

  it('says it is still checking before the first read lands, rather than rendering nothing', () => {
    act(() => root.render(<Sev1Banner sev1={[]} error={null} needsToken={false} loaded={false} />));
    expect(container.innerHTML).not.toBe('');
    expect(container.textContent).toMatch(/checking for open sev1/i);
  });

  it('keeps the last good sev1 list up when a later poll fails', () => {
    act(() => root.render(<Sev1Banner sev1={[PII]} error="timeout" needsToken={false} loaded />));
    expect(container.querySelector('a')?.getAttribute('href')).toBe(PII.url);
    expect(container.textContent).toContain('1 open');
  });
});
