import * as React from 'react';
import { useNavigate } from 'react-router';
import { Page } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { TextLockup } from '@hirobius/design-system';
import { ApprovalCard, type ApprovalUnitSummary, type ApprovalState } from '@/app/design-system-ext';

// 11a-3 — approval app list view.
//
// Reads docs/ai/orchestration.json (served as a static asset under /docs/ai
// in dev / from the bridge /orchestration/list endpoint when available).
// Filters to units with approval ∈ {proposed, needs-grilling} and renders
// one ApprovalCard per unit. Buttons POST to /orchestration/approve
// (bridge endpoint shipped in 11a-2). Optimistic UI: the card disappears
// from the inbox immediately, then reconciles on response. On error the
// optimistic mutation is rolled back.
//
// Per Q1=(a) ratification 2026-05-01 there is no live trigger — approval
// flips status proposed→pending and the next autonomous session picks the
// unit up via the existing pretest dry-run loop. This page does NOT call
// /run, /generate, or any execution surface.

const INBOX_FILTERS: ApprovalState[] = ['proposed', 'needs-grilling'];
const BRIDGE_BASE = 'http://localhost:3005';

interface OrchestrationUnitRaw extends ApprovalUnitSummary {
  status?: string;
  phase?: string | number;
  proposedBy?: string;
  source?: string;
}

interface ListResponse {
  status: string;
  total: number;
  filter: string | null;
  count: number;
  units: OrchestrationUnitRaw[];
}

type ApproveResponse = {
  status: string;
  id?: string;
  approval?: ApprovalState;
  previousApproval?: ApprovalState;
  previousStatus?: string;
  currentStatus?: string;
  statusFlipped?: boolean;
  error?: string;
};

async function fetchInbox(): Promise<OrchestrationUnitRaw[]> {
  // Try the bridge first; fall back to the static JSON in /docs (served by
  // Vite's public-dir mirror) so the page renders without the bridge running.
  try {
    const r = await fetch(`${BRIDGE_BASE}/orchestration/list`);
    if (r.ok) {
      const body = (await r.json()) as ListResponse;
      return body.units.filter((u) => INBOX_FILTERS.includes(u.approval as ApprovalState));
    }
  } catch (_) {
    // bridge offline — fall through to static read
  }
  try {
    const r = await fetch('/docs/ai/orchestration.json');
    if (!r.ok) return [];
    const data = (await r.json()) as { units?: OrchestrationUnitRaw[] };
    if (!Array.isArray(data.units)) return [];
    return data.units.filter((u) => INBOX_FILTERS.includes(u.approval as ApprovalState));
  } catch (_) {
    return [];
  }
}

async function postApproval(id: string, approval: ApprovalState): Promise<ApproveResponse> {
  const r = await fetch(`${BRIDGE_BASE}/orchestration/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, approval }),
  });
  return (await r.json()) as ApproveResponse;
}

interface InboxState {
  units: OrchestrationUnitRaw[];
  pending: Set<string>;
  loaded: boolean;
  bridgeOk: boolean;
  errorMessage: string | null;
}

const INITIAL_STATE: InboxState = {
  units: [],
  pending: new Set(),
  loaded: false,
  bridgeOk: true,
  errorMessage: null,
};

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const [state, setState] = React.useState<InboxState>(INITIAL_STATE);

  React.useEffect(() => {
    let cancelled = false;
    fetchInbox().then((units) => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, units, loaded: true }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reconcile = React.useCallback(
    async (id: string, approval: ApprovalState) => {
      // Optimistic remove.
      const previous = state.units.find((u) => u.id === id);
      setState((prev) => ({
        ...prev,
        units: prev.units.filter((u) => u.id !== id),
        pending: new Set([...prev.pending, id]),
      }));

      try {
        const result = await postApproval(id, approval);
        if (result.status !== 'ok') {
          // Rollback on server error.
          setState((prev) => {
            const nextPending = new Set(prev.pending);
            nextPending.delete(id);
            return {
              ...prev,
              units: previous ? [...prev.units, previous] : prev.units,
              pending: nextPending,
              errorMessage: result.error ?? 'unknown server error',
            };
          });
          return;
        }
        setState((prev) => {
          const nextPending = new Set(prev.pending);
          nextPending.delete(id);
          return { ...prev, pending: nextPending, errorMessage: null };
        });
      } catch (err) {
        setState((prev) => {
          const nextPending = new Set(prev.pending);
          nextPending.delete(id);
          return {
            ...prev,
            units: previous ? [...prev.units, previous] : prev.units,
            pending: nextPending,
            bridgeOk: false,
            errorMessage: err instanceof Error ? err.message : 'bridge unreachable',
          };
        });
      }
    },
    [state.units],
  );

  const inbox = state.units;

  return (
    <div className="hds-page-enter">
      <Page>
        <Stack gap="spacious">
          <TextLockup
            eyebrow="Admin · Approval Inbox"
            title="Pending unit approvals"
            description={`${inbox.length} unit${inbox.length === 1 ? '' : 's'} awaiting ratification. Approve flips the unit to pending; the next autonomous session executes it.`}
            size="section"
          />
          {state.errorMessage ? (
            <p className="text-sm text-destructive" data-role="approvals-error">
              Bridge error: {state.errorMessage}
            </p>
          ) : null}
          {!state.loaded ? (
            <p className="text-sm text-muted-foreground" data-role="approvals-loading">
              Loading inbox…
            </p>
          ) : inbox.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-role="approvals-empty">
              Inbox is empty — no units in proposed or needs-grilling state.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-role="approvals-grid">
              {inbox.map((unit) => (
                <ApprovalCard
                  key={unit.id}
                  unit={unit}
                  pending={state.pending.has(unit.id)}
                  onApprove={() => reconcile(unit.id, 'approved')}
                  onDeny={() => reconcile(unit.id, 'denied')}
                  onGrill={() => reconcile(unit.id, 'needs-grilling')}
                  onOpenDetail={(u) => navigate(`/admin/approvals/${u.id}`)}
                />
              ))}
            </div>
          )}
        </Stack>
      </Page>
    </div>
  );
}
