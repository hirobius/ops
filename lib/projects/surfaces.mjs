/**
 * lib/projects/surfaces.mjs — one board for every live surface (ops#416).
 *
 * Adrian: "I want to be able to see all deployments in 1 place for all of my
 * projects, pending / published / live / claude artifact / everything."
 *
 * `lib/projects/index.mjs` already answers "what does Vercel know about" —
 * but a Vercel-only board structurally cannot show a surface that was never
 * deployed. `concrete` is the case that motivated this: a complete storefront
 * with Stripe wired, and NO Vercel project exists for it. A board built from
 * discovery alone would omit it silently, which is exactly the case Adrian
 * most needs to see.
 *
 * So `docs/ai/SURFACES.json` declares what SHOULD exist — the registry — and
 * this module JOINS it onto what the Vercel API actually discovers. A
 * declared surface with no matching Vercel project renders as 'not-deployed'
 * instead of vanishing. Adding a surface means editing the registry; no code
 * change, per the DoD.
 *
 * Deliberately pure — the registry read (`loadSurfaceRegistry`) and the
 * Vercel read (`listProjects`, elsewhere) are both I/O, kept separate from the
 * join so the join itself is testable with plain fixtures.
 *
 * @typedef {Object} SurfaceEntry
 * @property {string} id
 * @property {'vercel'|'npm'|'figma'|'artifact'|'github'} kind
 * @property {string} name
 * @property {string} repo
 * @property {string} role
 * @property {string|null} [vercelProject]  the Vercel project name to join on — 'vercel' kind only
 * @property {boolean} [gated]              declared: this surface enforces a password gate
 * @property {string} [url]                 fixed URL — every non-'vercel' kind, or a custom domain override
 *
 * @typedef {'live'|'gated'|'preview'|'building'|'failed'|'not-deployed'|'external'} SurfaceState
 *
 * @typedef {Object} Surface
 * @property {string} id
 * @property {string} kind
 * @property {string} name
 * @property {string} repo
 * @property {string} role
 * @property {string|null} url    the ONE clickable link — stable, never a per-deploy hashed host (Gap 1)
 * @property {SurfaceState} state
 */

/**
 * A Vercel-kind surface's state, DERIVED from the live project the registry
 * entry named — never hand-set (DoD). `gated` is the one input that is not
 * itself live data: whether a surface enforces a password gate is a property
 * of its code (same category as `role`), which the Vercel API has no field
 * for. Everything else — building/failed/preview/not-deployed — comes
 * straight off `latestDeployment.state` and `.target`.
 *
 * @param {SurfaceEntry} entry
 * @param {null | { latestDeployment: null | { state: string, target: string|null } }} project
 * @returns {SurfaceState}
 */
export function deriveSurfaceState(entry, project) {
  if (entry.kind !== 'vercel') return 'external';
  const d = project?.latestDeployment;
  if (!d) return 'not-deployed';
  if (d.state === 'BUILDING' || d.state === 'QUEUED' || d.state === 'INITIALIZING')
    return 'building';
  if (d.state === 'ERROR' || d.state === 'CANCELED') return 'failed';
  if (d.state !== 'READY') return 'not-deployed'; // an unrecognised readyState — never claim READY
  if (d.target !== 'production') return 'preview';
  return entry.gated ? 'gated' : 'live';
}

/**
 * The one clickable link for a surface — the stable alias, never the
 * per-deploy hashed host `latestDeployment.url` carries (Gap 1: that host
 * changes on every deploy and is useless to a human).
 *
 * A registry `url` always wins (a custom domain, or the fixed link a
 * non-Vercel surface needs). Otherwise, for a Vercel surface with a live
 * project, Vercel's own default production alias — `<project-name>.vercel.app`
 * — is stable across deploys. No project, no link: a not-deployed surface has
 * nothing to point at.
 *
 * @param {SurfaceEntry} entry
 * @param {null | object} project
 * @returns {string|null}
 */
export function surfaceUrl(entry, project) {
  if (entry.url) return entry.url;
  if (entry.kind !== 'vercel' || !entry.vercelProject || !project) return null;
  return `https://${entry.vercelProject}.vercel.app`;
}

/**
 * Join the registry onto the live Vercel project list, by project name.
 *
 * @param {SurfaceEntry[]} registry
 * @param {Array<{ name: string, latestDeployment: null | { state: string, target: string|null } }>} projects
 * @returns {Surface[]}
 */
export function joinSurfaces(registry, projects) {
  const byName = new Map((Array.isArray(projects) ? projects : []).map((p) => [p.name, p]));
  return (Array.isArray(registry) ? registry : []).map((entry) => {
    const project = entry.vercelProject ? (byName.get(entry.vercelProject) ?? null) : null;
    return {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      repo: entry.repo,
      role: entry.role,
      url: surfaceUrl(entry, project),
      state: deriveSurfaceState(entry, project),
    };
  });
}
