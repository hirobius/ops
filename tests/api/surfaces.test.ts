/**
 * lib/projects/surfaces.mjs — the registry-join behind ops#416.
 *
 * The contract this locks down: a Vercel-kind entry's state is DERIVED from
 * the live project the registry named (never hand-set); a registry entry with
 * no matching Vercel project (or no `vercelProject` at all) is `not-deployed`,
 * not absent — the exact case `concrete` was filed over; a non-Vercel entry
 * is `external` and needs no live state; and the clickable URL is always the
 * stable alias, never a per-deploy hashed host.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveSurfaceState, joinSurfaces, surfaceUrl } from '../../lib/projects/surfaces.mjs';
import { loadSurfaceRegistry } from '../../lib/projects/index.mjs';

function vercelEntry(over: Record<string, unknown> = {}) {
  return {
    id: 'ops-dashboard',
    kind: 'vercel',
    name: 'Ops dashboard',
    repo: 'hirobius/ops',
    role: 'internal ops tool',
    vercelProject: 'hirobius-ops',
    gated: false,
    ...over,
  };
}

function project(over: Record<string, unknown> = {}) {
  return {
    name: 'hirobius-ops',
    latestDeployment: {
      state: 'READY',
      url: 'hirobius-ops-abc123.vercel.app',
      target: 'production',
    },
    ...over,
  };
}

describe('deriveSurfaceState', () => {
  it('is not-deployed when no project was found for the entry', () => {
    expect(deriveSurfaceState(vercelEntry(), null)).toBe('not-deployed');
  });

  it('is not-deployed when the project has never had a deployment', () => {
    expect(deriveSurfaceState(vercelEntry(), project({ latestDeployment: null }))).toBe(
      'not-deployed',
    );
  });

  it('is live for a production, ready, non-gated entry', () => {
    expect(deriveSurfaceState(vercelEntry({ gated: false }), project())).toBe('live');
  });

  it('is gated for a production, ready entry the registry declares gated', () => {
    expect(deriveSurfaceState(vercelEntry({ gated: true }), project())).toBe('gated');
  });

  it('is preview for a ready, non-production deployment', () => {
    const p = project({ latestDeployment: { state: 'READY', url: 'x', target: null } });
    expect(deriveSurfaceState(vercelEntry(), p)).toBe('preview');
  });

  it.each(['BUILDING', 'QUEUED', 'INITIALIZING'])('is building for readyState %s', (state) => {
    const p = project({ latestDeployment: { state, url: null, target: 'production' } });
    expect(deriveSurfaceState(vercelEntry(), p)).toBe('building');
  });

  it.each(['ERROR', 'CANCELED'])('is failed for readyState %s', (state) => {
    const p = project({ latestDeployment: { state, url: null, target: 'production' } });
    expect(deriveSurfaceState(vercelEntry(), p)).toBe('failed');
  });

  it('is external for any non-vercel kind, whatever the project argument', () => {
    expect(deriveSurfaceState({ kind: 'npm' }, project())).toBe('external');
    expect(deriveSurfaceState({ kind: 'figma' }, null)).toBe('external');
  });
});

describe('surfaceUrl', () => {
  it('prefers a registry-declared URL over anything derived', () => {
    expect(surfaceUrl(vercelEntry({ url: 'https://ops.example.com' }), project())).toBe(
      'https://ops.example.com',
    );
  });

  it('derives the stable default alias for a live Vercel project, not the hashed deploy host', () => {
    expect(surfaceUrl(vercelEntry(), project())).toBe('https://hirobius-ops.vercel.app');
  });

  it('is null for a not-deployed vercel entry — nothing to link to', () => {
    expect(surfaceUrl(vercelEntry(), null)).toBeNull();
  });

  it('is null for a non-vercel entry with no declared url', () => {
    expect(surfaceUrl({ kind: 'npm' }, null)).toBeNull();
  });
});

describe('joinSurfaces', () => {
  it('matches a registry entry to its Vercel project by name', () => {
    const [row] = joinSurfaces([vercelEntry()], [project()]);
    expect(row).toMatchObject({
      id: 'ops-dashboard',
      state: 'live',
      url: 'https://hirobius-ops.vercel.app',
    });
  });

  // The case ops#416 was filed over: a registry entry naming no Vercel
  // project at all must still appear, as not-deployed — never silently
  // dropped because nothing on the live side matched it.
  it('surfaces a never-deployed entry as not-deployed rather than omitting it', () => {
    const registry = [vercelEntry({ id: 'concrete', vercelProject: null })];
    const rows = joinSurfaces(registry, [project()]);
    expect(rows).toEqual([
      expect.objectContaining({ id: 'concrete', state: 'not-deployed', url: null }),
    ]);
  });

  it('carries a non-vercel entry through untouched by the Vercel project list', () => {
    const registry = [
      {
        id: 'hds-npm',
        kind: 'npm',
        name: '@hirobius/design-system',
        repo: 'hirobius/hds',
        role: 'pkg',
        url: 'https://npmjs.com/x',
      },
    ];
    const rows = joinSurfaces(registry, [project()]);
    expect(rows).toEqual([
      {
        id: 'hds-npm',
        kind: 'npm',
        name: '@hirobius/design-system',
        repo: 'hirobius/hds',
        role: 'pkg',
        url: 'https://npmjs.com/x',
        state: 'external',
      },
    ]);
  });

  it('tolerates non-array inputs rather than throwing', () => {
    expect(joinSurfaces(null, null)).toEqual([]);
    expect(joinSurfaces(undefined, undefined)).toEqual([]);
  });
});

describe('loadSurfaceRegistry', () => {
  it('reads the real committed docs/ai/SURFACES.json and names the concrete case', () => {
    const registry = loadSurfaceRegistry();
    expect(Array.isArray(registry)).toBe(true);
    expect(registry.length).toBeGreaterThan(0);
    const concrete = registry.find((e: { repo: string }) => e.repo === 'hirobius/concrete');
    expect(concrete).toBeTruthy();
    expect(concrete.vercelProject).toBeNull();
  });

  it('degrades to an empty registry for a missing file, rather than throwing', () => {
    expect(loadSurfaceRegistry('/nonexistent/does-not-exist.json')).toEqual([]);
  });

  it('degrades to an empty registry for malformed JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'surfaces-test-'));
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{ not valid json');
    try {
      expect(loadSurfaceRegistry(path)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('degrades to an empty registry when the top-level shape is wrong', () => {
    const dir = mkdtempSync(join(tmpdir(), 'surfaces-test-'));
    const path = join(dir, 'shape.json');
    writeFileSync(path, JSON.stringify({ surfaces: 'not an array' }));
    try {
      expect(loadSurfaceRegistry(path)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
