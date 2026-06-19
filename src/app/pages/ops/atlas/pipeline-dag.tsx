/* hds-bypass: ops-internal page. SVG-driven DAG layout. */

/**
 * PipelineDag — status-coloured dependency graph of orchestration units.
 *
 * Reads docs/ai/orchestration.json at build time, renders a DAG with:
 *   - Nodes per unit, coloured by status
 *   - Cubic bezier edges from each parent's right-center to child's left-center
 *   - Phase/cluster/status filter chips
 *   - Hover tooltip with unit name + agentNotes
 *   - Click panel below DAG with full description
 *
 * Default filter: phases 12 and 13 (active sprints).
 * Layout: columns per cluster, rows by topological depth.
 * No third-party graph or chart libraries — pure SVG.
 *
 * @category Internal
 * @tier utility
 */

import React, {
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import legacyTaskArchive from '../../../../../docs/ai/_archive/legacy-task-systems-2026-05-11.json';

const orchestrationRaw = legacyTaskArchive.sources.orchestration;

// ── Types ──────────────────────────────────────────────────────────────────────

interface OrchestrUnit {
  id: string;
  name?: string;
  phase?: string | number;
  cluster?: string;
  status?: string;
  dependsOn?: string[];
  description?: string;
  agentNotes?: string[];
  completedAt?: string;
  claimedBy?: string;
}

interface OrchestrData {
  units?: OrchestrUnit[];
}

interface NodeRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface EdgePath {
  d: string;
  fromId: string;
  toId: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const NODE_W = 160;
const NODE_H = 40;
const COL_GAP = 48;
const ROW_GAP = 14;
const COL_PAD = 24;

// Status fill colors (background of the node box)
const STATUS_BG: Record<string, string> = {
  done: 'var(--semantic-color-feedback-bg-success)',
  approved: 'var(--semantic-color-feedback-bg-info)',
  claimed: 'var(--semantic-color-feedback-bg-warning)',
  denied: 'var(--semantic-color-feedback-bg-error)',
  parked: 'var(--semantic-color-surface-raised)',
  'needs-grilling': 'var(--semantic-color-surface-raised)',
};

// Status border/accent colors
const STATUS_BORDER: Record<string, string> = {
  done: 'var(--semantic-color-feedback-success)',
  approved: 'var(--semantic-color-feedback-info)',
  claimed: 'var(--semantic-color-feedback-warning)',
  denied: 'var(--semantic-color-feedback-error)',
  parked: 'var(--semantic-color-border-default)',
  'needs-grilling': 'var(--semantic-color-border-default)',
};

// Status text colors
const STATUS_TEXT: Record<string, string> = {
  done: 'var(--semantic-color-feedback-success)',
  approved: 'var(--semantic-color-feedback-info)',
  claimed: 'var(--semantic-color-feedback-warning)',
  denied: 'var(--semantic-color-feedback-error)',
  parked: 'var(--semantic-color-content-secondary)',
  'needs-grilling': 'var(--semantic-color-content-secondary)',
};

function statusBg(s?: string) {
  return STATUS_BG[s ?? ''] ?? STATUS_BG['parked'];
}
function statusBorder(s?: string) {
  return STATUS_BORDER[s ?? ''] ?? STATUS_BORDER['parked'];
}
function statusText(s?: string) {
  return STATUS_TEXT[s ?? ''] ?? STATUS_TEXT['parked'];
}

// ── Data loading ───────────────────────────────────────────────────────────────

const ALL_UNITS: OrchestrUnit[] = (orchestrationRaw as OrchestrData).units ?? [];

/** Extract unique phase labels (string phases only, strip numeric legacy) */
const ALL_PHASES = [
  ...new Set(ALL_UNITS.map((u) => u.phase).filter((p): p is string => typeof p === 'string')),
].sort();

const ALL_STATUSES = [
  ...new Set(ALL_UNITS.map((u) => u.status).filter((s): s is string => Boolean(s))),
].sort();

// Default active phases: 12-* and 13-*
const DEFAULT_PHASE_PREFIXES = ['12', '13'];

// ── Topological depth ──────────────────────────────────────────────────────────

function computeDepths(units: OrchestrUnit[]): Map<string, number> {
  const idSet = new Set(units.map((u) => u.id));
  const depths = new Map<string, number>();
  const inEdgeMap = new Map<string, string[]>();

  for (const u of units) {
    if (!inEdgeMap.has(u.id)) inEdgeMap.set(u.id, []);
    for (const dep of u.dependsOn ?? []) {
      if (idSet.has(dep)) {
        const list = inEdgeMap.get(u.id) ?? [];
        list.push(dep);
        inEdgeMap.set(u.id, list);
      }
    }
  }

  // BFS from roots (no deps within set)
  const queue: string[] = [];
  for (const u of units) {
    const deps = (u.dependsOn ?? []).filter((d) => idSet.has(d));
    if (deps.length === 0) {
      depths.set(u.id, 0);
      queue.push(u.id);
    }
  }

  // If cycle or disconnected, assign depth 0 as fallback
  for (const u of units) {
    if (!depths.has(u.id)) {
      depths.set(u.id, 0);
      queue.push(u.id);
    }
  }

  const idToUnit = new Map(units.map((u) => [u.id, u]));
  // Relax depths
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of units) {
      const deps = (u.dependsOn ?? []).filter((d) => idSet.has(d));
      const maxDepDepth = deps.reduce((max, d) => Math.max(max, depths.get(d) ?? 0), -1);
      const newDepth = maxDepDepth + 1;
      if (newDepth > (depths.get(u.id) ?? 0)) {
        depths.set(u.id, newDepth);
        changed = true;
      }
    }
  }
  void idToUnit; // suppress unused warning
  void queue;

  return depths;
}

// ── Layout computation ─────────────────────────────────────────────────────────

interface LayoutResult {
  nodes: NodeRect[];
  totalW: number;
  totalH: number;
}

function computeLayout(units: OrchestrUnit[]): LayoutResult {
  if (units.length === 0) return { nodes: [], totalW: 0, totalH: 0 };

  const depths = computeDepths(units);

  // Group by cluster → rows, then within each cluster order by depth
  const clusterMap = new Map<string, OrchestrUnit[]>();
  for (const u of units) {
    const c = u.cluster ?? '_none';
    if (!clusterMap.has(c)) clusterMap.set(c, []);
    clusterMap.get(c)!.push(u);
  }

  // Sort clusters by average depth so that deeper clusters sit further right
  const clusters = [...clusterMap.entries()].sort(([, a], [, b]) => {
    const avgA = a.reduce((s, u) => s + (depths.get(u.id) ?? 0), 0) / a.length;
    const avgB = b.reduce((s, u) => s + (depths.get(u.id) ?? 0), 0) / b.length;
    return avgA - avgB;
  });

  const nodes: NodeRect[] = [];
  let colX = COL_PAD;

  for (const [, clusterUnits] of clusters) {
    // Sort within cluster by depth then by id
    const sorted = [...clusterUnits].sort((a, b) => {
      const da = depths.get(a.id) ?? 0;
      const db = depths.get(b.id) ?? 0;
      if (da !== db) return da - db;
      return a.id.localeCompare(b.id);
    });

    let rowY = COL_PAD;
    for (const u of sorted) {
      nodes.push({ id: u.id, x: colX, y: rowY, w: NODE_W, h: NODE_H });
      rowY += NODE_H + ROW_GAP;
    }

    colX += NODE_W + COL_GAP;
  }

  const totalW = colX - COL_GAP + COL_PAD;
  const maxY = nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0) + COL_PAD;

  return { nodes, totalW, totalH: maxY };
}

// ── Bezier helpers ─────────────────────────────────────────────────────────────

function makeBezier(from: NodeRect, to: NodeRect): string {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const dx = Math.abs(x2 - x1) * 0.5;
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}

// ── Static styles ─────────────────────────────────────────────────────────────

const dagStyles = {
  statusBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 12,
    fontFamily: hds.monoFamily,
  } satisfies React.CSSProperties,
  phaseBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 12,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-secondary)',
    border: '1px solid var(--semantic-color-border-default)',
    fontFamily: hds.monoFamily,
  } satisfies React.CSSProperties,
  dependsOnBadge: {
    fontSize: 11,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'var(--semantic-color-surface-page)',
    color: 'var(--semantic-color-content-accent)',
    border: '1px solid var(--semantic-color-border-default)',
    fontFamily: hds.monoFamily,
  } satisfies React.CSSProperties,
  chipBase: {
    all: 'unset' as const,
    cursor: 'pointer',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: hds.space.px4,
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontFamily: hds.monoFamily,
    userSelect: 'none' as const,
    transition: `all ${hds.duration.fast} ease`,
  },
  nodeStatusLabel: {
    fontSize: 10,
    fontFamily: hds.monoFamily,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.3,
  } satisfies React.CSSProperties,
  nodeIdLabel: {
    fontSize: 11,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    lineHeight: 1.3,
    fontFamily: hds.monoFamily,
  } satisfies React.CSSProperties,
  tooltipContainer: {
    pointerEvents: 'none' as const,
    maxWidth: 280,
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 8,
    padding: '8px 12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
  } satisfies React.CSSProperties,
  detailPanelCloseBtn: {
    all: 'unset' as const,
    cursor: 'pointer',
    position: 'absolute' as const,
    top: hds.space.px12,
    right: hds.space.px12,
    color: 'var(--semantic-color-content-secondary)',
    fontSize: 18,
    lineHeight: 1,
  } satisfies React.CSSProperties,
  detailPanelBase: {
    marginTop: hds.space.px16,
    padding: hds.space.px16,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: 8,
    position: 'relative' as const,
  } satisfies React.CSSProperties,
} as const;

// ── Filter chips ───────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
}

function Chip({ label, active, onClick, color }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className="hds-focus"
      style={{
        ...dagStyles.chipBase,
        // Active state conveyed via border + background + color, not fontWeight.
        border: `1px solid ${active ? (color ?? 'var(--semantic-color-border-accent)') : 'var(--semantic-color-border-default)'}`,
        background: active ? (color ? `${color}22` : 'var(--semantic-color-surface-raised)') : 'transparent',
        color: active ? (color ?? 'var(--semantic-color-content-accent)') : 'var(--semantic-color-content-secondary)',
      }}
    >
      {label}
    </button>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────

interface TooltipState {
  unit: OrchestrUnit;
  x: number;
  y: number;
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function DetailPanel({ unit, onClose }: { unit: OrchestrUnit; onClose: () => void }) {
  return (
    <div
      style={{ ...dagStyles.detailPanelBase, border: `1px solid ${statusBorder(unit.status)}` }}
    >
      <button
        onClick={onClose}
        className="hds-focus"
        style={dagStyles.detailPanelCloseBtn}
        aria-label="Close detail panel"
      >
        ×
      </button>

      <div
        style={{
          ...hds.typeStyles.labelTechnical,
          color: 'var(--semantic-color-content-accent)',
          marginBottom: hds.space.px4,
        }}
      >
        {unit.id}
      </div>
      <div
        style={{
          ...hds.typeStyles.h3,
          margin: '0 0 8px',
          color: 'var(--semantic-color-content-primary)',
        }}
      >
        {unit.name ?? unit.id}
      </div>

      <div
        style={{
          display: 'flex',
          gap: hds.space.px8,
          marginBottom: hds.space.px12,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{ ...dagStyles.statusBadge, background: statusBg(unit.status), color: statusText(unit.status), border: `1px solid ${statusBorder(unit.status)}` }}
        >
          {unit.status ?? 'unknown'}
        </span>
        {unit.phase && (
          <span style={dagStyles.phaseBadge}>
            {String(unit.phase)}
          </span>
        )}
        {unit.cluster && (
          <span style={dagStyles.phaseBadge}>
            {unit.cluster}
          </span>
        )}
      </div>

      {unit.description && (
        <p
          style={{
            ...hds.typeStyles.body,
            margin: '0 0 12px',
            color: 'var(--semantic-color-content-secondary)',
          }}
        >
          {unit.description}
        </p>
      )}

      {unit.dependsOn && unit.dependsOn.length > 0 && (
        <div style={{ marginBottom: hds.space.px12 }}>
          <div
            style={{
              ...hds.typeStyles.label,
              color: 'var(--semantic-color-content-disabled)',
              marginBottom: hds.space.px4,
            }}
          >
            DEPENDS ON
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px4 }}>
            {unit.dependsOn.map((d) => (
              <span
                key={d}
                style={dagStyles.dependsOnBadge}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {unit.agentNotes && unit.agentNotes.length > 0 && (
        <div>
          <div
            style={{
              ...hds.typeStyles.label,
              color: 'var(--semantic-color-content-disabled)',
              marginBottom: hds.space.px4,
            }}
          >
            AGENT NOTES
          </div>
          <ul style={{ margin: 0, padding: '0 0 0 20px' }}>
            {unit.agentNotes.map((note, i) => (
              <li
                key={i}
                style={{
                  ...hds.typeStyles.ui,
                  color: 'var(--semantic-color-content-secondary)',
                  marginBottom: hds.space.px4,
                }}
              >
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PipelineDag() {
  // ── Filter state ────────────────────────────────────────────────────────────
  const [phaseFilter, setPhaseFilter] = useState<Set<string>>(
    new Set(
      ALL_PHASES.filter((p) => DEFAULT_PHASE_PREFIXES.some((pfx) => String(p).startsWith(pfx))),
    ),
  );
  const [clusterFilter, setClusterFilter] = useState<Set<string>>(new Set<string>());
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set<string>());

  // ── Interaction state ───────────────────────────────────────────────────────
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<OrchestrUnit | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Filtered units ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return ALL_UNITS.filter((u) => {
      // Phase filter
      if (phaseFilter.size > 0 && !phaseFilter.has(String(u.phase ?? ''))) return false;
      // Cluster filter
      if (clusterFilter.size > 0 && !clusterFilter.has(u.cluster ?? '')) return false;
      // Status filter
      if (statusFilter.size > 0 && !statusFilter.has(u.status ?? '')) return false;
      return true;
    });
  }, [phaseFilter, clusterFilter, statusFilter]);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const layout = useMemo(() => computeLayout(filtered), [filtered]);
  const nodeMap = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  // ── Edges ───────────────────────────────────────────────────────────────────
  const edges = useMemo<EdgePath[]>(() => {
    const result: EdgePath[] = [];
    const filteredIds = new Set(filtered.map((u) => u.id));

    for (const u of filtered) {
      for (const dep of u.dependsOn ?? []) {
        if (!filteredIds.has(dep)) continue;
        const fromNode = nodeMap.get(dep);
        const toNode = nodeMap.get(u.id);
        if (!fromNode || !toNode) continue;
        result.push({
          d: makeBezier(fromNode, toNode),
          fromId: dep,
          toId: u.id,
        });
      }
    }
    return result;
  }, [filtered, nodeMap]);

  // ── Hover handlers ──────────────────────────────────────────────────────────
  const handleNodeMouseEnter = useCallback((unit: OrchestrUnit, e: React.MouseEvent) => {
    setHoveredId(unit.id);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const container = containerRef.current?.getBoundingClientRect();
    setTooltip({
      unit,
      x: rect.left - (container?.left ?? 0),
      y: rect.bottom - (container?.top ?? 0) + 6,
    });
  }, []);

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredId(null);
    setTooltip(null);
  }, []);

  const handleNodeClick = useCallback((unit: OrchestrUnit) => {
    setSelectedUnit((prev) => (prev?.id === unit.id ? null : unit));
  }, []);

  // ── Toggle helpers ──────────────────────────────────────────────────────────
  function togglePhase(p: string) {
    setPhaseFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function toggleCluster(c: string) {
    setClusterFilter((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function toggleStatus(s: string) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // ── ID → unit lookup ────────────────────────────────────────────────────────
  const unitMap = useMemo(() => new Map(ALL_UNITS.map((u) => [u.id, u])), []);

  const visibleClusters = useMemo(
    () =>
      [...new Set(filtered.map((u) => u.cluster).filter((c): c is string => Boolean(c)))].sort(),
    [filtered],
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Stack direction="column" gap="px16">

      {/* Filter bar */}
      <Stack direction="column" gap="px8">
        {/* Phase chips */}
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px6, alignItems: 'center' }}
        >
          <span
            style={{
              ...hds.typeStyles.label,
              color: 'var(--semantic-color-content-disabled)',
              minWidth: 48, // audit-ok: fixed label column for filter row alignment
            }}
          >
            PHASE
          </span>
          {ALL_PHASES.map((p) => (
            <Chip key={p} label={p} active={phaseFilter.has(p)} onClick={() => togglePhase(p)} />
          ))}
        </div>

        {/* Status chips */}
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px6, alignItems: 'center' }}
        >
          <span
            style={{
              ...hds.typeStyles.label,
              color: 'var(--semantic-color-content-disabled)',
              minWidth: 48, // audit-ok: fixed label column for filter row alignment // audit-ok: fixed label column for filter row alignment
            }}
          >
            STATUS
          </span>
          {ALL_STATUSES.map((s) => (
            <Chip
              key={s}
              label={s}
              active={statusFilter.has(s)}
              onClick={() => toggleStatus(s)}
              color={STATUS_TEXT[s]}
            />
          ))}
        </div>

        {/* Cluster chips — only show clusters present in filtered set */}
        {visibleClusters.length > 1 && (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px6, alignItems: 'center' }}
          >
            <span
              style={{
                ...hds.typeStyles.label,
                color: 'var(--semantic-color-content-disabled)',
                minWidth: 48, // audit-ok: fixed label column for filter row alignment // audit-ok: fixed label column for filter row alignment
              }}
            >
              CLUSTER
            </span>
            {visibleClusters.map((c) => (
              <Chip
                key={c}
                label={c}
                active={clusterFilter.has(c)}
                onClick={() => toggleCluster(c)}
              />
            ))}
          </div>
        )}
      </Stack>

      {/* Summary */}
      <div style={{ ...hds.typeStyles.label, color: 'var(--semantic-color-content-disabled)' }}>
        {filtered.length} units · {edges.length} edges
      </div>

      {/* DAG canvas */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            minWidth: layout.totalW || 200,
            minHeight: layout.totalH || 100,
          }}
        >
          {/* SVG edge overlay */}
          <svg
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: layout.totalW || '100%',
              height: layout.totalH || '100%',
              pointerEvents: 'none',
              overflow: 'visible',
              zIndex: 1,
            }}
          >
            {edges.map((e, i) => {
              const isHighlighted = hoveredId === e.fromId || hoveredId === e.toId;
              return (
                <path
                  key={i}
                  d={e.d}
                  fill="none"
                  stroke={
                    isHighlighted
                      ? 'var(--semantic-color-content-accent)'
                      : 'var(--semantic-color-border-default)'
                  }
                  strokeWidth={isHighlighted ? 2 : 1}
                  opacity={hoveredId && !isHighlighted ? 0.25 : 1}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {layout.nodes.map((n) => {
            const unit = unitMap.get(n.id);
            if (!unit) return null;
            const isHovered = hoveredId === n.id;
            const isSelected = selectedUnit?.id === n.id;
            const isDimmed = hoveredId !== null && !isHovered;
            return (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onMouseEnter={(e) => handleNodeMouseEnter(unit, e)}
                onMouseLeave={handleNodeMouseLeave}
                onClick={() => handleNodeClick(unit)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleNodeClick(unit);
                }}
                // inline-ok: DAG node — position/size/opacity/border/shadow all computed from layout+hover+select state
                style={{
                  position: 'absolute',
                  left: n.x,
                  top: n.y,
                  width: n.w,
                  height: n.h,
                  zIndex: 2,
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.35 : 1,
                  transition: `opacity ${hds.duration.fast} ease, box-shadow ${hds.duration.fast} ease`,
                  boxSizing: 'border-box',
                  borderRadius: 6,
                  border: `1px solid ${isSelected ? 'var(--semantic-color-content-accent)' : statusBorder(unit.status)}`,
                  background: statusBg(unit.status),
                  boxShadow: isHovered ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '0 8px',
                  overflow: 'hidden',
                }}
              >
                <div style={{ ...dagStyles.nodeStatusLabel, color: statusText(unit.status) }}>
                  {unit.status?.toUpperCase() ?? '—'}
                </div>
                <div style={dagStyles.nodeIdLabel}>
                  {n.id}
                </div>
              </div>
            );
          })}

          {/* Tooltip */}
          {tooltip && (
            <div
              style={{ ...dagStyles.tooltipContainer, position: 'absolute', left: tooltip.x, top: tooltip.y, zIndex: 10 }}
            >
              <div
                style={{
                  fontFamily: hds.monoFamily,
                  fontSize: 10,
                  color: statusText(tooltip.unit.status),
                  marginBottom: 2,
                }}
              >
                {tooltip.unit.status?.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: hds.monoFamily,
                  fontSize: 12,
                  color: 'var(--semantic-color-content-primary)',
                  marginBottom: hds.space.px4,
                }}
              >
                {tooltip.unit.name ?? tooltip.unit.id}
              </div>
              {tooltip.unit.agentNotes && tooltip.unit.agentNotes.length > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--semantic-color-content-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {tooltip.unit.agentNotes[0]}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedUnit && (
        <DetailPanel unit={selectedUnit} onClose={() => setSelectedUnit(null)} />
      )}
    </Stack>
  );
}
