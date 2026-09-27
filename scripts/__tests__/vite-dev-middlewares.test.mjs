/**
 * Guard for ops redesign T2 (2026-09-27): the dev-only middlewares whose
 * /ops consumers were stripped in T1 (Plugins, Research, New skill) or were
 * already gone (/ops/kanban threads + proposed units, /ops/sessions pod tail)
 * must stay unregistered, and their scripts deleted.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const viteConfig = readFileSync(path.join(root, 'vite.config.mjs'), 'utf8');

const DEAD = [
  { route: '/api/cc-plugins', script: 'cc-plugins-middleware.mjs' },
  { route: '/api/research-feed', script: 'research-feed-middleware.mjs' },
  { route: '/api/proposed-skills', script: 'proposed-skills-middleware.mjs' },
  { route: '/api/threads', script: 'threads-middleware.mjs' },
  { route: '/api/proposed-units', script: 'proposed-units-middleware.mjs' },
  { route: '/api/pod-tail', script: null },
];

describe('vite.config.mjs — dead dev middlewares stay removed', () => {
  it.each(DEAD)('does not mount $route', ({ route, script }) => {
    expect(viteConfig).not.toContain(`'${route}'`);
    if (script) {
      expect(viteConfig).not.toContain(script);
      expect(existsSync(path.join(root, 'scripts', script))).toBe(false);
    }
  });

  it('keeps the live dev middlewares (skills, services, leads, tasks, digest)', () => {
    for (const route of [
      '/api/skills',
      '/api/services',
      '/api/leads',
      '/api/tasks',
      '/api/digest',
    ]) {
      expect(viteConfig).toContain(`'${route}'`);
    }
  });
});
