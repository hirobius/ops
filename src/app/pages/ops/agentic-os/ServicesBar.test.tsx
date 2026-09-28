/**
 * ServicesBar — guards the HDS migration (ops#425): one row per local-dev
 * service, each closed by an HDS Divider; a running service shows its PID +
 * uptime and a "stop" toggle, a stopped one its hint and "start"; clicking
 * the toggle POSTs the action and flips the row to its busy (inflight) state.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const post = vi.fn(() => Promise.resolve(new Response('{}')));
vi.mock('../../../lib/opsApi', () => ({ opsApi: { post: (url: string) => post(url) } }));
vi.mock('../useServicesStatus', () => ({
  useServicesStatus: () => ({
    'hds-bridge': {
      status: 'running',
      pid: 4242,
      startedAt: new Date(Date.now() - 7_530_000).toISOString(),
    },
    'discord-bot': { status: 'stopped' },
  }),
}));

import { ServicesBar } from './ServicesBar';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  post.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ServicesBar />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function buttons() {
  return [...container.querySelectorAll('button')];
}

describe('ServicesBar', () => {
  it('renders one row per service, each closed by an HDS Divider', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('HDS Bridge');
    expect(text).toContain('Discord Bot');
    expect(container.querySelectorAll('hr')).toHaveLength(2);
  });

  it('shows PID + uptime and "stop" for a running service, hint + "start" for a stopped one', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('PID 4242 · 2h 5m');
    expect(text).toContain('Discord gateway · requires DISCORD_BOT_TOKEN');
    expect(buttons().map((b) => b.textContent)).toEqual(['stop', 'start']);
  });

  it('POSTs the start action and marks the row busy while inflight', async () => {
    await act(async () => {
      buttons()[1].click();
    });
    expect(post).toHaveBeenCalledWith('/api/services/discord-bot/start');
    const btn = buttons()[1];
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe('…');
  });
});
