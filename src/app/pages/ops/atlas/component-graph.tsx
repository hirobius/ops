/* hds-bypass: ops-internal page. SVG graph with raw markdown parsing. */

/**
 * ComponentGraph — interactive component dependency graph for /ops/atlas#components.
 *
 * Parses the direct dependency table in docs/SYSTEM_ATLAS.md at build time.
 * Nodes = source files (primitives by default; filterable by HDS category).
 * Edges = import relationships.
 *
 * Hover a node → highlight its 1-hop consumers + dependencies (direct edges).
 * Click a node → expand to transitive view (multi-hop chain).
 *
 * Reuses SVG + ResizeObserver bezier pattern from TokenCascadeDiagram.tsx.
 *
 * @category Internal
 * @tier utility
 */

import React, { useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

// ── Build-time data imports ───────────────────────────────────────────────────

import systemAtlasRaw from '../../../../../docs/SYSTEM_ATLAS.md?raw';
import hdsManifest from '../../../../../public/hds-manifest.json';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string; // kebab-case component name
  label: string; // PascalCase display name
  category: string; // from hds-manifest or 'Other'
  isPrimitive: boolean; // in src/app/components/ (not in subdirs)
}

interface GraphEdge {
  from: string;
  to: string;
}

interface Pt {
  x: number;
  y: number;
}

interface RenderedPath {
  d: string;
  fromId: string;
  toId: string;
}

type FilterCategory =
  | 'all'
  | 'Layout'
  | 'Inputs'
  | 'Feedback'
  | 'Display'
  | 'Navigation'
  | 'Actions'
  | 'Branding'
  | 'Utilities';

// ── Markdown parser ───────────────────────────────────────────────────────────

/**
 * Parse direct dependency lines from SYSTEM_ATLAS.md.
 * Format: `- \`SourceName\` -> Target1, Target2, ...`
 * (Lines with chain arrows like A -> B -> C are transitive — skip them.)
 */
function parseAtlas(markdown: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const lines = markdown.split('\n');
  const depMap = new Map<string, string[]>();

  for (const line of lines) {
    // Match: - `Name` -> targets (no additional arrows in targets part)
    const m = line.match(/^- `(\w+)` -> (.+)$/);
    if (!m) continue;
    const source = m[1];
    const rest = m[2];
    // Skip transitive chain lines (contain additional " -> ")
    if (rest.includes(' -> ')) continue;
    const targets = rest
      .split(',')
      .map((t) => t.trim().replace(/`/g, '').trim())
      .filter(Boolean);
    depMap.set(source, targets);
  }

  // Build node set from all names appearing in the dep map
  const nameSet = new Set<string>();
  for (const [src, tgts] of depMap) {
    nameSet.add(src);
    for (const t of tgts) nameSet.add(t);
  }

  // Get category map from hds-manifest
  const categoryMap = new Map<string, string>();
  const specs = (hdsManifest as Record<string, unknown>)['componentSpecs'] as Record<
    string,
    { category?: string }
  >;
  if (specs) {
    for (const [name, spec] of Object.entries(specs)) {
      if (spec?.category) categoryMap.set(name, spec.category);
    }
  }

  // Primitive = appears in src/app/components/ at the top level (simple heuristic: PascalCase)
  // We treat nodes whose names appear in the atlas as components/primitives
  const nodes: GraphNode[] = Array.from(nameSet).map((name) => ({
    id: name,
    label: name,
    category: categoryMap.get(name) ?? 'Other',
    isPrimitive: true, // All nodes from SYSTEM_ATLAS direct deps are primitives/layouts
  }));

  const edges: GraphEdge[] = [];
  for (const [src, tgts] of depMap) {
    for (const t of tgts) {
      edges.push({ from: src, to: t });
    }
  }

  return { nodes, edges };
}

// ── Graph data (computed once) ────────────────────────────────────────────────

const { nodes: ALL_NODES, edges: ALL_EDGES } = parseAtlas(systemAtlasRaw);

// ── Cascade helpers ───────────────────────────────────────────────────────────

function getDirectNeighbors(nodeId: string, edges: GraphEdge[]): Set<string> {
  const neighbors = new Set<string>([nodeId]);
  for (const e of edges) {
    if (e.from === nodeId) neighbors.add(e.to);
    if (e.to === nodeId) neighbors.add(e.from);
  }
  return neighbors;
}

function getTransitiveChain(nodeId: string, edges: GraphEdge[]): Set<string> {
  const chain = new Set<string>([nodeId]);

  function walkDown(id: string) {
    for (const e of edges) {
      if (e.from === id && !chain.has(e.to)) {
        chain.add(e.to);
        walkDown(e.to);
      }
    }
  }
  function walkUp(id: string) {
    for (const e of edges) {
      if (e.to === id && !chain.has(e.from)) {
        chain.add(e.from);
        walkUp(e.from);
      }
    }
  }

  walkDown(nodeId);
  walkUp(nodeId);
  return chain;
}

// ── Bezier helpers ────────────────────────────────────────────────────────────

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function bezierPath(p0: Pt, p3: Pt): string {
  const dx = (p3.x - p0.x) * 0.5;
  const p1: Pt = { x: p0.x + dx, y: p0.y };
  const p2: Pt = { x: p3.x - dx, y: p3.y };
  lerp(p0, p1, 0); // keep lerp used
  return `M ${p0.x},${p0.y} C ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`;
}

// ── Category filter chips ─────────────────────────────────────────────────────

const FILTER_CATEGORIES: FilterCategory[] = [
  'all',
  'Layout',
  'Inputs',
  'Feedback',
  'Display',
  'Navigation',
  'Actions',
  'Branding',
  'Utilities',
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ComponentGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [paths, setPaths] = useState<RenderedPath[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FilterCategory>('all');

  // Filter nodes by category
  const visibleNodes = useMemo(() => {
    if (categoryFilter === 'all') return ALL_NODES;
    return ALL_NODES.filter((n) => n.category === categoryFilter);
  }, [categoryFilter]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  // Filter edges to only those where both endpoints are visible
  const visibleEdges = useMemo(
    () => ALL_EDGES.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to)),
    [visibleNodeIds],
  );

  // Highlight chain based on hover or selection
  const activeChain = useMemo(() => {
    const targetId = hoveredId ?? selectedId;
    if (!targetId) return null;
    if (selectedId) return getTransitiveChain(targetId, visibleEdges);
    return getDirectNeighbors(targetId, visibleEdges);
  }, [hoveredId, selectedId, visibleEdges]);

  // Compute SVG bezier paths from DOM layout
  const compute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const next: RenderedPath[] = [];

    for (const edge of visibleEdges) {
      const fEl = nodeRefs.current.get(edge.from);
      const tEl = nodeRefs.current.get(edge.to);
      if (!fEl || !tEl) continue;

      const fr = fEl.getBoundingClientRect();
      const tr = tEl.getBoundingClientRect();

      const p0: Pt = { x: fr.right - cr.left, y: fr.top + fr.height / 2 - cr.top };
      const p3: Pt = { x: tr.left - cr.left, y: tr.top + tr.height / 2 - cr.top };

      // Only draw left-to-right edges (avoid crossing lines for reversed deps)
      if (p3.x <= p0.x) continue;

      next.push({ d: bezierPath(p0, p3), fromId: edge.from, toId: edge.to });
    }

    setPaths(next);
  }, [visibleEdges]);

  useLayoutEffect(() => {
    // Clear old node refs that are no longer visible
    const validIds = visibleNodeIds;
    for (const id of nodeRefs.current.keys()) {
      if (!validIds.has(id)) nodeRefs.current.delete(id);
    }

    compute();
    const obs = new ResizeObserver(compute);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [compute, visibleNodeIds]);

  // Layout: group nodes by category for column-style arrangement
  const groupedNodes = useMemo(() => {
    const groups = new Map<string, GraphNode[]>();
    for (const node of visibleNodes) {
      const g = groups.get(node.category) ?? [];
      g.push(node);
      groups.set(node.category, g);
    }
    return groups;
  }, [visibleNodes]);

  const groups = Array.from(groupedNodes.entries());
  const totalNodes = visibleNodes.length;
  const totalEdges = visibleEdges.length;

  return (
    <Stack direction="column" gap="gap">
      {/* Stats bar */}
      <div style={s.statsBar}>
        <span style={s.statItem}>{totalNodes} nodes</span>
        <span style={s.statDivider}>·</span>
        <span style={s.statItem}>{totalEdges} edges</span>
        {selectedId && (
          <>
            <span style={s.statDivider}>·</span>
            <span style={{ ...s.statItem, color: 'var(--semantic-color-content-accent)' }}>
              {selectedId} selected — transitive view
            </span>
            <button style={s.clearBtn} onClick={() => setSelectedId(null)}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Category filter chips */}
      <div style={s.filterRow} role="group" aria-label="Filter by category">
        {FILTER_CATEGORIES.map((cat) => {
          const isActive = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => {
                setCategoryFilter(cat);
                setSelectedId(null);
              }}
              className="hds-focus"
              style={{
                ...s.chip,
                background: isActive
                  ? 'var(--semantic-color-surface-accent)'
                  : 'var(--semantic-color-surface-raised)',
                color: isActive
                  ? 'var(--semantic-color-content-on-accent)'
                  : 'var(--semantic-color-content-secondary)',
                borderColor: isActive
                  ? 'var(--semantic-color-border-accent)'
                  : 'var(--semantic-color-border-default)',
              }}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          );
        })}
      </div>

      {/* Hint text */}
      <p style={s.hint}>Hover to highlight direct edges · Click to expand transitive chain</p>

      {/* Graph canvas — horizontal scroll on narrow viewports */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          ref={containerRef}
          data-inspector-ignore="architecture-diagram"
          style={{ position: 'relative', minWidth: Math.max(520, groups.length * 180) }}
        >
          {/* Node columns by category */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: hds.space.px24,
              alignItems: 'flex-start',
              padding: `${hds.space.px8} 0`,
            }}
          >
            {groups.map(([category, nodes]) => (
              <div key={category} style={s.column}>
                {/* Column header */}
                <p style={s.columnHeader}>{category.toUpperCase()}</p>

                {/* Nodes */}
                {nodes.map((node) => {
                  const isActive = !activeChain || activeChain.has(node.id);
                  const isHovered = node.id === hoveredId;
                  const isSelected = node.id === selectedId;

                  return (
                    <div
                      key={node.id}
                      ref={(el) => {
                        if (el) nodeRefs.current.set(node.id, el);
                        else nodeRefs.current.delete(node.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onMouseEnter={() => {
                        if (!selectedId) setHoveredId(node.id);
                      }}
                      onMouseLeave={() => {
                        if (!selectedId) setHoveredId(null);
                      }}
                      onClick={() => setSelectedId((prev) => (prev === node.id ? null : node.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedId((prev) => (prev === node.id ? null : node.id));
                        }
                      }}
                      style={{
                        ...s.node,
                        opacity: isActive ? 1 : 0.18,
                        background: isSelected
                          ? 'var(--semantic-color-surface-accent)'
                          : isHovered
                            ? 'var(--semantic-color-surface-raised-hover)'
                            : 'var(--semantic-color-surface-raised)',
                        color: isSelected
                          ? 'var(--semantic-color-content-on-accent)'
                          : 'var(--semantic-color-content-primary)',
                        borderColor:
                          isSelected || isHovered
                            ? 'var(--semantic-color-border-accent)'
                            : 'var(--semantic-color-border-default)',
                        boxShadow: isSelected
                          ? '0 0 0 2px var(--semantic-color-border-accent)'
                          : 'none',
                        transition:
                          'opacity 0.16s ease, background 0.12s ease, border-color 0.12s ease',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ ...hds.typeStyles.ui, fontSize: 11, whiteSpace: 'nowrap' }}>
                        {node.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* SVG overlay for bezier edges */}
          <svg
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <defs>
              <marker
                id="cg-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path
                  d="M0,0 L0,6 L6,3 Z"
                  fill="color-mix(in srgb, var(--semantic-color-content-primary) 25%, transparent)"
                />
              </marker>
              <marker
                id="cg-arrow-active"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L0,6 L6,3 Z" fill="var(--semantic-color-content-accent)" />
              </marker>
            </defs>

            {paths.map((p, i) => {
              const isEdgeActive = activeChain
                ? activeChain.has(p.fromId) && activeChain.has(p.toId)
                : false;
              const hasActive = activeChain !== null;

              return (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  stroke={
                    isEdgeActive
                      ? 'var(--semantic-color-content-accent)'
                      : hasActive
                        ? 'color-mix(in srgb, var(--semantic-color-content-primary) 6%, transparent)'
                        : 'color-mix(in srgb, var(--semantic-color-content-primary) 18%, transparent)'
                  }
                  strokeWidth={isEdgeActive ? 1.5 : 1}
                  markerEnd={isEdgeActive ? 'url(#cg-arrow-active)' : 'url(#cg-arrow)'}
                  style={{ transition: `stroke ${hds.duration.fast} ease, stroke-width ${hds.duration.fast} ease` }}
                />
              );
            })}
          </svg>
        </div>
      </div>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  statItem: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    fontSize: 12,
  },
  statDivider: {
    color: 'var(--semantic-color-content-disabled)',
    fontSize: 12,
  },
  clearBtn: {
    ...hds.typeStyles.ui,
    fontSize: 11,
    background: 'transparent',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
    color: 'var(--semantic-color-content-secondary)',
  } as React.CSSProperties,
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: hds.space.px6,
  },
  chip: {
    ...hds.typeStyles.ui,
    fontSize: 11,
    border: '1px solid',
    borderRadius: 12,
    padding: '3px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: `background ${hds.duration.fast} ease, color ${hds.duration.fast} ease`,
  } as React.CSSProperties,
  hint: {
    ...hds.typeStyles.ui,
    fontSize: 11,
    color: 'var(--semantic-color-content-disabled)',
    margin: 0,
  },
  column: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px6,
    minWidth: 140,
    maxWidth: 180,
    flexShrink: 0,
  },
  columnHeader: {
    ...hds.typeStyles.ui,
    fontSize: 10,
    letterSpacing: '0.09em',
    color: 'var(--semantic-color-content-secondary)',
    margin: '0 0 4px',
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 9px',
    borderRadius: 6,
    border: '1px solid',
    userSelect: 'none' as const,
  },
} satisfies Record<string, React.CSSProperties>;
