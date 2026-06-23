import * as React from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { Page } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { TextLockup } from '@hirobius/design-system';
import { Card } from '@hirobius/design-system';
import { Button } from '@hirobius/design-system';
import { Field } from '@hirobius/design-system';
import { Tag } from '@hirobius/design-system';
import type { ApprovalState } from '../../components/approval-card';

// 11a-4 — approval app detail view.
//
// Route: /admin/approvals/:id
//
// Renders the full orchestration unit spec — description, agentNotes,
// inputs, outputs, validationCmd, dependsOn (each as a link to its unit).
// Adrian can edit description / priority / sprint / agentNotes inline; when
// he picks an approval action the edits ride along in the POST body's
// `edits` field (validated by the 11a-2 bridge endpoint).
//
// No fetch logic in ApprovalCard — the detail page owns the read AND
// the mutation, mirroring the list page's optimistic-reconcile pattern.

const BRIDGE_BASE = 'http://localhost:3005';

interface OrchestrationUnit {
  id: string;
  phase?: string | number;
  cluster?: string;
  sprint?: number;
  priority?: number;
  name: string;
  status?: string;
  approval?: ApprovalState;
  proposedBy?: string;
  source?: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
  validationCmd?: string;
  estimate?: string;
  agentNotes?: string[];
  dependsOn?: string[];
  completedAt?: string;
}

interface OrchestrationDoc {
  units?: OrchestrationUnit[];
}

interface DocFetchResult {
  units: OrchestrationUnit[];
  source: 'bridge' | 'static' | 'none';
}

async function fetchOrchestration(): Promise<DocFetchResult> {
  try {
    const r = await fetch(`${BRIDGE_BASE}/orchestration/list`);
    if (r.ok) {
      const body = (await r.json()) as { units?: OrchestrationUnit[] };
      if (Array.isArray(body.units)) return { units: body.units, source: 'bridge' };
    }
  } catch (_) {
    // fallthrough
  }
  try {
    const r = await fetch('/docs/ai/orchestration.json');
    if (r.ok) {
      const body = (await r.json()) as OrchestrationDoc;
      if (Array.isArray(body.units)) return { units: body.units, source: 'static' };
    }
  } catch (_) {
    // fallthrough
  }
  return { units: [], source: 'none' };
}

interface ApproveResponse {
  status: string;
  id?: string;
  approval?: ApprovalState;
  previousApproval?: ApprovalState;
  previousStatus?: string;
  currentStatus?: string;
  statusFlipped?: boolean;
  editsApplied?: string[];
  error?: string;
}

interface EditableFields {
  description: string;
  priority: number | null;
  sprint: number | null;
  agentNotes: string[];
}

function unitToEditableFields(unit: OrchestrationUnit): EditableFields {
  return {
    description: unit.description ?? '',
    priority: typeof unit.priority === 'number' ? unit.priority : null,
    sprint: typeof unit.sprint === 'number' ? unit.sprint : null,
    agentNotes: Array.isArray(unit.agentNotes) ? [...unit.agentNotes] : [],
  };
}

type ApprovalEditDiff = {
  description?: string;
  priority?: number;
  sprint?: number;
  agentNotes?: string[];
};

function diffEdits(unit: OrchestrationUnit, edited: EditableFields): ApprovalEditDiff {
  const diff: ApprovalEditDiff = {};
  if ((unit.description ?? '') !== edited.description) {
    diff.description = edited.description;
  }
  if (typeof edited.priority === 'number' && edited.priority !== (unit.priority ?? null)) {
    diff.priority = edited.priority;
  }
  if (typeof edited.sprint === 'number' && edited.sprint !== (unit.sprint ?? null)) {
    diff.sprint = edited.sprint;
  }
  const original = Array.isArray(unit.agentNotes) ? unit.agentNotes : [];
  const sameNotes =
    original.length === edited.agentNotes.length &&
    original.every((n, i) => n === edited.agentNotes[i]);
  if (!sameNotes) {
    diff.agentNotes = edited.agentNotes;
  }
  return diff;
}

async function postApproval(id: string, approval: ApprovalState, edits: ApprovalEditDiff) {
  const hasEdits = Object.keys(edits).length > 0;
  const payload: { id: string; approval: ApprovalState; edits?: ApprovalEditDiff } = {
    id,
    approval,
  };
  if (hasEdits) payload.edits = edits;
  const r = await fetch(`${BRIDGE_BASE}/orchestration/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await r.json()) as ApproveResponse;
}

interface DetailState {
  units: OrchestrationUnit[];
  loaded: boolean;
  source: 'bridge' | 'static' | 'none';
  pending: boolean;
  errorMessage: string | null;
  successMessage: string | null;
}

const INITIAL_STATE: DetailState = {
  units: [],
  loaded: false,
  source: 'none',
  pending: false,
  errorMessage: null,
  successMessage: null,
};

export default function ApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = params.id ?? '';

  const [state, setState] = React.useState<DetailState>(INITIAL_STATE);
  const [edited, setEdited] = React.useState<EditableFields | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchOrchestration().then(({ units, source }) => {
      if (cancelled) return;
      setState((prev) => ({ ...prev, units, source, loaded: true }));
      const found = units.find((u) => u.id === id);
      setEdited(found ? unitToEditableFields(found) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const unit = React.useMemo(() => state.units.find((u) => u.id === id) ?? null, [state.units, id]);

  const dependsOnUnits = React.useMemo(() => {
    if (!unit?.dependsOn) return [] as Array<{ id: string; unit: OrchestrationUnit | null }>;
    return unit.dependsOn.map((depId) => ({
      id: depId,
      unit: state.units.find((u) => u.id === depId) ?? null,
    }));
  }, [unit, state.units]);

  const dispatchApproval = React.useCallback(
    async (approval: ApprovalState) => {
      if (!unit || !edited) return;
      const edits = diffEdits(unit, edited);
      setState((prev) => ({ ...prev, pending: true, errorMessage: null, successMessage: null }));
      try {
        const result = await postApproval(unit.id, approval, edits);
        if (result.status !== 'ok') {
          setState((prev) => ({
            ...prev,
            pending: false,
            errorMessage: result.error ?? 'unknown server error',
          }));
          return;
        }
        const editsApplied = result.editsApplied?.join(', ') ?? '';
        const messageParts = [
          `Marked ${result.id} as ${result.approval}.`,
          result.statusFlipped
            ? `Status flipped ${result.previousStatus} → ${result.currentStatus}.`
            : '',
          editsApplied ? `Edits applied: ${editsApplied}.` : '',
        ].filter(Boolean);
        setState((prev) => ({
          ...prev,
          pending: false,
          successMessage: messageParts.join(' '),
        }));
        // After a successful mutation return to the inbox after a moment so
        // the user can read the toast.
        setTimeout(() => navigate('/admin/approvals'), 800);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          pending: false,
          errorMessage: err instanceof Error ? err.message : 'bridge unreachable',
        }));
      }
    },
    [unit, edited, navigate],
  );

  if (!state.loaded) {
    return (
      <div className="hds-page-enter">
        <Page>
          <p className="text-sm text-muted-foreground" data-role="approval-detail-loading">
            Loading…
          </p>
        </Page>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="hds-page-enter">
        <Page>
          <Stack gap="spacious">
            <TextLockup
              eyebrow="Admin · Approval"
              title={`Unit not found: ${id}`}
              description="No orchestration unit matches this id. Return to the inbox to pick another unit."
              size="section"
            />
            <Link to="/admin/approvals" className="text-sm underline hover:no-underline">
              ← Back to inbox
            </Link>
          </Stack>
        </Page>
      </div>
    );
  }

  if (!edited) {
    return null;
  }

  const hasEdits = Object.keys(diffEdits(unit, edited)).length > 0;

  return (
    <div className="hds-page-enter">
      <Page>
        <Stack gap="spacious">
          <Stack gap="tight">
            <Link
              to="/admin/approvals"
              className="text-sm underline hover:no-underline"
              data-role="back-link"
            >
              ← Back to inbox
            </Link>
            <TextLockup
              eyebrow={`Admin · Approval · ${unit.id}`}
              title={unit.name}
              description={`Phase ${String(unit.phase ?? '—')} · cluster ${unit.cluster ?? '—'} · status ${unit.status ?? '—'} · approval ${unit.approval ?? '—'}`}
              size="section"
            />
            <div className="flex flex-wrap gap-2">
              {typeof unit.sprint === 'number' ? <Tag>Sprint {unit.sprint}</Tag> : null}
              {typeof unit.priority === 'number' ? <Tag>Priority {unit.priority}</Tag> : null}
              {unit.cluster ? <Tag>{unit.cluster}</Tag> : null}
              {unit.proposedBy ? <Tag>Proposed by {unit.proposedBy}</Tag> : null}
            </div>
          </Stack>

          {state.successMessage ? (
            <p className="text-sm text-foreground" data-role="approval-detail-success">
              {state.successMessage}
            </p>
          ) : null}
          {state.errorMessage ? (
            <p className="text-sm text-destructive" data-role="approval-detail-error">
              Bridge error: {state.errorMessage}
            </p>
          ) : null}

          <Card>
            <Card.Header>
              <Card.Title>Description</Card.Title>
              <Card.Description>
                Edit the description before approving. Edits ride along with the approval mutation.
              </Card.Description>
            </Card.Header>
            <Card.Body>
              <textarea
                className="min-h-48 w-full rounded-md border border-input bg-background p-3 text-sm"
                value={edited.description}
                onChange={(e) =>
                  setEdited((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                }
                disabled={state.pending}
                data-role="description-input"
                aria-label="Unit description"
              />
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Classification</Card.Title>
              <Card.Description>
                Priority (1 = highest, 5 = lowest) · Sprint (0 = current, 6 = far backlog).
              </Card.Description>
            </Card.Header>
            <Card.Body>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Priority</span>
                  <select
                    className="rounded-md border border-input bg-background p-2 text-sm"
                    value={edited.priority ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      setEdited((prev) => (prev ? { ...prev, priority: v } : prev));
                    }}
                    disabled={state.pending}
                    data-role="priority-input"
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Sprint</span>
                  <select
                    className="rounded-md border border-input bg-background p-2 text-sm"
                    value={edited.sprint ?? ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? null : Number(e.target.value);
                      setEdited((prev) => (prev ? { ...prev, sprint: v } : prev));
                    }}
                    disabled={state.pending}
                    data-role="sprint-input"
                  >
                    <option value="">—</option>
                    {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Agent notes</Card.Title>
              <Card.Description>
                One per line. Notes that capture caveats, gotchas, and design decisions for the
                executing agent.
              </Card.Description>
            </Card.Header>
            <Card.Body>
              <textarea
                className="min-h-32 w-full rounded-md border border-input bg-background p-3 text-sm font-mono"
                value={edited.agentNotes.join('\n')}
                onChange={(e) =>
                  setEdited((prev) =>
                    prev
                      ? { ...prev, agentNotes: e.target.value.split('\n').filter(Boolean) }
                      : prev,
                  )
                }
                disabled={state.pending}
                data-role="agent-notes-input"
                aria-label="Agent notes — one per line"
              />
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Spec metadata (read-only)</Card.Title>
            </Card.Header>
            <Card.Body>
              <div className="grid gap-4 md:grid-cols-2" data-role="spec-metadata">
                <Field label="Source" value={unit.source ?? '—'} />
                <Field label="Estimate" value={unit.estimate ?? '—'} />
                <Field label="Validation command" value={unit.validationCmd ?? '—'} mono />
                <Field label="Completed at" value={unit.completedAt ?? '—'} />
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Inputs / outputs</Card.Title>
            </Card.Header>
            <Card.Body>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Inputs" data-role="inputs-list">
                  {unit.inputs && unit.inputs.length > 0 ? (
                    <ul className="m-0 space-y-1 font-mono text-xs">
                      {unit.inputs.map((input) => (
                        <li key={input}>{input}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">No inputs declared.</span>
                  )}
                </Field>
                <Field label="Outputs" data-role="outputs-list">
                  {unit.outputs && unit.outputs.length > 0 ? (
                    <ul className="m-0 space-y-1 font-mono text-xs">
                      {unit.outputs.map((output) => (
                        <li key={output}>{output}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">No outputs declared.</span>
                  )}
                </Field>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Dependency chain</Card.Title>
              <Card.Description>
                {dependsOnUnits.length === 0
                  ? 'No upstream dependencies — eligible whenever approved.'
                  : `Depends on ${dependsOnUnits.length} unit${dependsOnUnits.length === 1 ? '' : 's'}.`}
              </Card.Description>
            </Card.Header>
            {dependsOnUnits.length > 0 ? (
              <Card.Body>
                <ul className="space-y-2" data-role="depends-on-list">
                  {dependsOnUnits.map(({ id: depId, unit: depUnit }) => (
                    <li key={depId} className="flex items-baseline gap-3 text-sm">
                      <Link
                        to={`/admin/approvals/${depId}`}
                        className="font-mono underline hover:no-underline"
                      >
                        {depId}
                      </Link>
                      <span className="text-muted-foreground">
                        {depUnit
                          ? `${depUnit.name} (${depUnit.status ?? 'unknown'})`
                          : 'unit not found'}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card.Body>
            ) : null}
          </Card>

          <Card>
            <Card.Header>
              <Card.Title>Decision</Card.Title>
              <Card.Description>
                Approve flips status proposed → pending; the next autonomous session executes. Edits
                are persisted with the mutation.
                {hasEdits ? ' Pending edits will ride along.' : ''}
              </Card.Description>
            </Card.Header>
            <Card.Footer className="gap-2">
              <Button
                variant="primary"
                size="md"
                disabled={state.pending}
                onClick={() => dispatchApproval('approved')}
                data-role="approve-button"
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                size="md"
                disabled={state.pending}
                onClick={() => dispatchApproval('denied')}
                data-role="deny-button"
              >
                Deny
              </Button>
              <Button
                variant="tertiary"
                size="md"
                disabled={state.pending}
                onClick={() => dispatchApproval('needs-grilling')}
                data-role="grill-button"
              >
                Send to grilling
              </Button>
            </Card.Footer>
          </Card>
        </Stack>
      </Page>
    </div>
  );
}
