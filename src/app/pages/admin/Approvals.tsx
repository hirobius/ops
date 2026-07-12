import * as React from 'react';
import { useNavigate } from 'react-router';
import { Page, Stack, TextLockup } from '@hirobius/design-system';
import { ApprovalCard } from '../../components/approval-card';
import { useApprovalsInbox, taskToApprovalUnit } from './useApprovalsInbox';

// Fleet approvals inbox — list view (epic #41, Slice 3).
//
// Reads the live `tasks` store (GET /api/tasks via useApprovalsInbox →
// useTasks) and filters to `dispatch_status === 'queued'` — tasks proposed
// for dispatch but awaiting a human click. Auto-dispatch (`auto_ok=true`)
// tasks self-run WITHOUT hitting this inbox; that's a separate lever
// (/ops/tasks' "Auto: on/off" toggle, Slice 1).
//
// Approve → POST /api/task-action { action: 'dispatch' } — opens the
//   `@claude` GitHub issue and clears dispatch_status off 'queued'.
// Deny    → POST /api/task-action { action: 'unqueue' } — back to the backlog.
//
// Replaces the retired Figma-bridge dev-server fetch entirely (that dev
// port was swept 2026-07-02 — see docs/ai/HANDOFF.md). No edit form here —
// v1 tasks have no editable spec-doc fields; operators edit a task from
// /ops/tasks directly.

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const { queued, loaded, busyKeys, errorMessage, approve, deny } = useApprovalsInbox();

  return (
    <div className="hds-page-enter">
      <Page>
        <Stack gap="spacious">
          <TextLockup
            eyebrow="Admin · Approval Inbox"
            title="Tasks awaiting approval"
            description={`${queued.length} task${queued.length === 1 ? '' : 's'} queued for dispatch. Approve opens the @claude GitHub issue; deny sends the task back to the backlog.`}
            size="section"
          />
          {errorMessage ? (
            <p className="text-sm text-destructive" data-role="approvals-error">
              {errorMessage}
            </p>
          ) : null}
          {!loaded ? (
            <p className="text-sm text-muted-foreground" data-role="approvals-loading">
              Loading inbox…
            </p>
          ) : queued.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-role="approvals-empty">
              {EMPTY_STATE_MESSAGE}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-role="approvals-grid">
              {queued.map((t) => (
                <ApprovalCard
                  key={t.key}
                  unit={taskToApprovalUnit(t)}
                  pending={busyKeys.has(t.key)}
                  onApprove={() => approve(t.key)}
                  onDeny={() => deny(t.key)}
                  onOpenDetail={(u) => navigate(`/admin/approvals/${encodeURIComponent(u.id)}`)}
                />
              ))}
            </div>
          )}
        </Stack>
      </Page>
    </div>
  );
}

const EMPTY_STATE_MESSAGE =
  "No tasks awaiting approval — mark a task 'queue' on the board or turn on auto-dispatch.";
