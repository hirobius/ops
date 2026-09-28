/**
 * SurfacesRail — each jump-tile is a real client-side link to its /ops peer.
 * Guards the HDS migration (ops#425): the tile is Box rendered `as` react-router
 * Link, which only works if Box forwards `to` through to Link.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { SurfacesRail } from './SurfacesRail';

describe('SurfacesRail', () => {
  it('renders one labelled link per sibling surface, pointing at its route', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter>
          <SurfacesRail />
        </MemoryRouter>,
      );
    });

    const nav = container.querySelector('nav[aria-label="Sibling surfaces"]');
    expect(nav).not.toBeNull();
    const links = [...nav!.querySelectorAll('a')].map((a) => [
      a.getAttribute('href'),
      a.querySelector('span')?.textContent,
    ]);
    expect(links).toEqual([
      ['/ops/leads', 'Leads'],
      ['/ops/digest', 'Digest'],
      ['/ops/pitch', 'Pitch'],
      ['/ops/standing', 'Standing'],
      ['/ops/audit', 'Audit'],
      ['/ops/library', 'Library'],
      ['/ops/clients', 'Clients'],
    ]);

    act(() => root.unmount());
    container.remove();
  });
});
