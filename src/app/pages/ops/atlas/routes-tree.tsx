/* hds-bypass: ops-internal page. Vite raw import + brace-balanced parsing for route introspection. */

/**
 * RoutesTree — interactive tree view of all routes in src/app/routes.tsx
 *
 * Parses routes at build time using Vite ?raw import. The parser is
 * brace-balanced and recursive: it walks the createBrowserRouter array,
 * descends into every `children: [...]`, and accumulates the parent path so
 * that `{ path: 'tokens' }` nested under `{ path: 'hds', children: [...] }`
 * resolves to `/hds/tokens` (not `/tokens`).
 *
 * Each leaf is classified:
 *   - active page         → real component, clickable
 *   - active redirect     → <Navigate to=... /> to a non-404 target, clickable
 *   - parametric (:slug)  → not navigable without a fixture, demoted
 *   - broken (→ /404)     → deliberately deprecated, demoted
 *
 * Demoted entries render in a subdued sub-list at the bottom of each section
 * so the eye lands on real, clickable routes first.
 *
 * @category Internal
 * @tier utility
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import routesSource from '../../../routes.tsx?raw';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RouteEntry {
  path: string; // full absolute path, e.g. "/hds/tokens"
  componentName: string;
  isLazy: boolean;
  isParametric: boolean;
  isRedirect: boolean;
  isBroken: boolean; // redirect target is /404
  redirectTo?: string;
  section: string;
}

// ── Parser ────────────────────────────────────────────────────────────────────

function findMatching(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}

function parseRouteArray(
  source: string,
  start: number,
  end: number,
  parentPath: string,
  out: RouteEntry[],
): void {
  let i = start;
  let inStr: string | null = null;
  while (i < end) {
    const c = source[i];
    if (inStr) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c;
      i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < end && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < end - 1 && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === '{') {
      const close = findMatching(source, i, '{', '}');
      const objEnd = Math.min(close + 1, end);
      parseRouteObject(source, i, objEnd, parentPath, out);
      i = objEnd;
      continue;
    }
    i++;
  }
}

function parseRouteObject(
  source: string,
  start: number,
  end: number,
  parentPath: string,
  out: RouteEntry[],
): void {
  const block = source.substring(start, end);

  // Slice the object's *own* properties — strip everything from `children:` onward
  // so we don't pull a child's element into this route's component detection.
  const childrenIdx = block.indexOf('children:');
  const ownBlock = childrenIdx >= 0 ? block.substring(0, childrenIdx) : block;

  const pathMatch = ownBlock.match(/\bpath:\s*['"]([^'"]*)['"]/);
  const isIndex = /\bindex:\s*true/.test(ownBlock);
  if (!pathMatch && !isIndex) return;

  const segment = pathMatch ? pathMatch[1] : '';
  if (segment === '*') return; // catch-all, not a navigable route

  let fullPath: string;
  if (isIndex) {
    fullPath = parentPath || '/';
  } else if (segment.startsWith('/')) {
    fullPath = segment;
  } else {
    fullPath = ((parentPath || '') + '/' + segment).replace(/\/+/g, '/');
  }
  if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;
  if (fullPath.length > 1 && fullPath.endsWith('/')) fullPath = fullPath.slice(0, -1);

  const navigateMatch = ownBlock.match(/<Navigate\s+to=['"]([^'"]+)['"]/);
  const elementPageMatch = ownBlock.match(/Page=\{(\w+)\}/);
  const lazyMatch = ownBlock.match(/lazy\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]/);
  const componentMatch = ownBlock.match(/\bComponent:\s*(\w+)/);

  let componentName = 'Unknown';
  let isLazy = false;
  let isRedirect = false;
  let isBroken = false;
  let redirectTo: string | undefined;

  if (navigateMatch) {
    isRedirect = true;
    redirectTo = navigateMatch[1];
    componentName = `→ ${redirectTo}`;
    if (redirectTo === '/404' || redirectTo.endsWith('/404')) isBroken = true;
  } else if (elementPageMatch) {
    componentName = elementPageMatch[1];
    isLazy = true;
  } else if (lazyMatch) {
    componentName = lazyMatch[1].split('/').pop() || 'LazyComponent';
    isLazy = true;
  } else if (componentMatch) {
    componentName = componentMatch[1];
  }

  const isParametric = fullPath.includes(':');

  let section = 'Public';
  if (fullPath.startsWith('/ops/hds')) section = 'HDS';
  else if (fullPath.startsWith('/hds'))
    section = 'HDS (legacy redirect)'; // route-ok: legacy redirect source
  else if (fullPath.startsWith('/ops')) section = 'Ops';
  else if (fullPath.startsWith('/admin')) section = 'Admin';
  else if (fullPath.startsWith('/lab')) section = 'Lab';
  else if (fullPath.startsWith('/vibe-sketchbook')) section = 'Sketches';

  if (componentName !== 'Unknown') {
    out.push({
      path: fullPath,
      componentName,
      isLazy,
      isParametric,
      isRedirect,
      isBroken,
      redirectTo,
      section,
    });
  }

  // Recurse into children with the accumulated path as the new parent.
  if (childrenIdx >= 0) {
    let pos = childrenIdx + 'children:'.length;
    while (pos < block.length && block[pos] !== '[') pos++;
    if (pos < block.length) {
      const absBracket = start + pos;
      const absEnd = findMatching(source, absBracket, '[', ']');
      parseRouteArray(source, absBracket + 1, absEnd, fullPath, out);
    }
  }
}

function parseRoutes(source: string): RouteEntry[] {
  const m = source.match(/createBrowserRouter\(\s*\[/);
  if (!m) return [];
  const arrOpen = source.indexOf('[', m.index!);
  const arrClose = findMatching(source, arrOpen, '[', ']');
  const out: RouteEntry[] = [];
  parseRouteArray(source, arrOpen + 1, arrClose, '', out);
  return out;
}

// ── Grouping ──────────────────────────────────────────────────────────────────

const SECTION_ORDER = ['Public', 'HDS', 'Ops', 'Sketches', 'Admin', 'Lab'] as const;

function groupBySection(routes: RouteEntry[]): Record<string, RouteEntry[]> {
  const grouped: Record<string, RouteEntry[]> = {};
  SECTION_ORDER.forEach((s) => {
    grouped[s] = [];
  });
  routes.forEach((r) => {
    if (!grouped[r.section]) grouped[r.section] = [];
    grouped[r.section].push(r);
  });
  Object.keys(grouped).forEach((s) => grouped[s].sort((a, b) => a.path.localeCompare(b.path)));
  return grouped;
}

// ── Components ────────────────────────────────────────────────────────────────

function RouteLeaf({ route, demoted = false }: { route: RouteEntry; demoted?: boolean }) {
  const inactive = route.isParametric || route.isBroken;

  const inner = (
    <>
      <div style={s.routeText}>
        <code style={demoted ? s.routePathDemoted : s.routePath}>{route.path}</code>
        <span style={demoted ? s.componentNameDemoted : s.componentName}>
          {route.componentName}
        </span>
      </div>
      <div style={s.routeBadges}>
        {route.isParametric && <Badge tone="neutral">param</Badge>}
        {route.isBroken && <Badge tone="warning">deprecated</Badge>}
        {route.isRedirect && !route.isBroken && <Badge tone="neutral">redirect</Badge>}
        {route.isLazy && !inactive && <Badge tone="neutral">lazy</Badge>}
      </div>
    </>
  );

  if (inactive) {
    return <div style={demoted ? s.routeLeafDemoted : s.routeLeaf}>{inner}</div>;
  }

  return (
    <Link to={route.path} style={s.routeLeafLink}>
      {inner}
    </Link>
  );
}

function InactiveCluster({ routes }: { routes: RouteEntry[] }) {
  const [open, setOpen] = useState(false);
  if (routes.length === 0) return null;

  return (
    <div style={s.inactiveWrap}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hds-focus"
        style={s.inactiveSummary}
      >
        <span style={s.sectionMarker} aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span style={s.inactiveTitle}>{routes.length} not navigable (parametric / deprecated)</span>
      </button>
      {open && (
        <div style={s.routesList}>
          {routes.map((route, idx) => (
            <RouteLeaf key={`${route.path}-${idx}`} route={route} demoted />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionGroup({ title, routes }: { title: string; routes: RouteEntry[] }) {
  // Hand-rolled collapsible. Native <details> would be cleaner but Chrome
  // keeps children's layout boxes alive when collapsed (the visual collapse
  // is render-only, not display:none) — the layout-audit then sees route
  // leaves positioned hundreds of pixels below the surface and flags them as
  // overflow. Conditional rendering via React state is the only reliable fix.
  const [open, setOpen] = useState(false);
  if (routes.length === 0) return null;

  const active = routes.filter((r) => !r.isParametric && !r.isBroken);
  const inactive = routes.filter((r) => r.isParametric || r.isBroken);

  return (
    <div style={s.sectionDetails}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="hds-focus"
        style={s.sectionSummary}
      >
        <span style={s.sectionMarker} aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span style={s.sectionTitle}>{title}</span>
        <span style={s.routeCount}>
          {active.length} route{active.length === 1 ? '' : 's'}
          {inactive.length > 0 ? ` · ${inactive.length} inactive` : ''}
        </span>
      </button>
      {open && (
        <div style={s.routesList}>
          {active.map((route, idx) => (
            <RouteLeaf key={`${route.path}-${idx}`} route={route} />
          ))}
          <InactiveCluster routes={inactive} />
        </div>
      )}
    </div>
  );
}

export default function RoutesTree() {
  const grouped = useMemo(() => {
    const routes = parseRoutes(routesSource);
    return groupBySection(routes);
  }, []);

  const totalActive = SECTION_ORDER.reduce(
    (acc, s) => acc + (grouped[s] || []).filter((r) => !r.isParametric && !r.isBroken).length,
    0,
  );
  const totalInactive = SECTION_ORDER.reduce(
    (acc, s) => acc + (grouped[s] || []).filter((r) => r.isParametric || r.isBroken).length,
    0,
  );

  return (
    <Stack direction="column" gap="inset">
      <div style={s.header}>
        <p style={s.headerText}>
          {totalActive} navigable route{totalActive === 1 ? '' : 's'} across{' '}
          {SECTION_ORDER.filter((sec) => (grouped[sec] || []).length > 0).length} sections.
          {totalInactive > 0
            ? ` ${totalInactive} parametric or deprecated entries grouped at the bottom of each section.`
            : ''}
        </p>
      </div>

      <Stack direction="column" gap="gap">
        {SECTION_ORDER.map((sec) => (
          <SectionGroup key={sec} title={sec} routes={grouped[sec] || []} />
        ))}
      </Stack>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const GAP = hds.semantic.space.component.gap;
const SECTION_INSET = hds.semantic.space.section.inset;

const s = {
  header: {
    paddingTop: SECTION_INSET,
  } as React.CSSProperties,

  headerText: {
    ...hds.typeStyles.body,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  } as React.CSSProperties,

  sectionDetails: {} as React.CSSProperties,

  sectionSummary: {
    all: 'unset',
    boxSizing: 'border-box',
    width: '100%',
    display: 'flex',
    gap: GAP,
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    padding: 0,
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
  } as React.CSSProperties,

  sectionMarker: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-tertiary)',
    flexShrink: 0,
    width: '1ch',
  } as React.CSSProperties,

  sectionTitle: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-primary)',
    flex: 1,
  } as React.CSSProperties,

  routeCount: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-tertiary)',
  } as React.CSSProperties,

  routesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: GAP,
    marginTop: GAP,
  } as React.CSSProperties,

  routeLeaf: {
    display: 'flex',
    gap: GAP,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: GAP,
    backgroundColor: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
  } as React.CSSProperties,

  routeLeafDemoted: {
    display: 'flex',
    gap: GAP,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: GAP,
    backgroundColor: 'transparent',
    border: '1px dashed var(--semantic-color-border-subtle)',
    borderRadius: hds.borderRadius.md,
    opacity: 0.7,
  } as React.CSSProperties,

  routeLeafLink: {
    display: 'flex',
    gap: GAP,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: GAP,
    backgroundColor: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    textDecoration: 'none',
    color: 'inherit',
    transition: `background-color ${hds.duration.fast} ease, border-color ${hds.duration.fast} ease`,
  } as React.CSSProperties,

  routeText: {
    display: 'flex',
    flexDirection: 'column',
    gap: hds.semantic.space.subgrid.gap,
    minWidth: 0,
    flex: 1,
  } as React.CSSProperties,

  routeBadges: {
    display: 'flex',
    gap: hds.semantic.space.subgrid.gap,
    alignItems: 'center',
    flexShrink: 0,
  } as React.CSSProperties,

  routePath: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-accent)',
    margin: 0,
    overflowWrap: 'anywhere',
  } as React.CSSProperties,

  routePathDemoted: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-tertiary)',
    margin: 0,
    overflowWrap: 'anywhere',
  } as React.CSSProperties,

  componentName: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  } as React.CSSProperties,

  componentNameDemoted: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-tertiary)',
    margin: 0,
  } as React.CSSProperties,

  inactiveWrap: {
    marginTop: GAP,
    paddingTop: GAP,
    borderTop: '1px dashed var(--semantic-color-border-subtle)',
  } as React.CSSProperties,

  inactiveSummary: {
    all: 'unset',
    boxSizing: 'border-box',
    width: '100%',
    display: 'flex',
    gap: GAP,
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
    padding: 0,
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
  } as React.CSSProperties,

  inactiveTitle: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-tertiary)',
    flex: 1,
  } as React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
