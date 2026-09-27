/**
 * AgenticOSPage (/ops home) — strip guard (ops redesign T1).
 *
 * The Routes tree, Clients disclosure, New-skill form, Plugins bar and
 * Research feed were confirmed dead in the 2026-09-27 audit and removed. This
 * pins that they stay gone: none of those section labels may render on /ops.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import AgenticOSPage from './AgenticOSPage';

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({}),
}));

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderHome() {
  const router = createMemoryRouter([{ path: '/ops', element: <AgenticOSPage /> }], {
    initialEntries: ['/ops'],
  });
  return render(<RouterProvider router={router} />);
}

/** Every section head on the page: Disclosure buttons + plain section eyebrows. */
function sectionLabels(): string[] {
  const heads = Array.from(document.querySelectorAll('section button[aria-expanded]'));
  return heads.map((el) => (el.textContent ?? '').trim());
}

describe('AgenticOSPage — confirmed-dead sections stay stripped', () => {
  it('still renders the Ops page header', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: 'Ops' })).toBeTruthy();
  });

  it.each(['Routes', 'Plugins', 'Research', 'New skill', 'Clients'])(
    'renders no "%s" section',
    (label) => {
      renderHome();
      const hits = sectionLabels().filter((t) => t.startsWith(label));
      expect(hits).toEqual([]);
      // The plain (non-disclosure) Section eyebrow for Routes is a span; guard it too.
      expect(screen.queryByText('all /app routes — clickable')).toBeNull();
    },
  );
});
