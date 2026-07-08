import * as React from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { Page, Stack, TextLockup } from '@hirobius/design-system';
import { ApprovalCard } from '../../components/approval-card';
import { useApprovalsInbox, taskToApprovalUnit } from './useApprovalsInbox';

// Fleet approvals inbox — detail view (epic #41, Slice 3).
//
// Route: /admin/approvals/:id — id is the URI-encoded `task.key`. Task keys
// can contain '/' and '#' (e.g. `github:hirobius/ops#42`, see
// lib/supabase/tasks.mjs upsertTasks), so the list view encodes the key when
// linking here and this page decodes it back before matching.
//
// Folds into the same tasks-store inbox as Approvals.tsx (useApprovalsInbox),
// filtered to one key — no separate fetch, no edit form (v1 tasks have no
// editable spec-doc fields). Approve/deny use the same live /api/task-action
// mutation as the list view. Replaces the retired Figma-bridge dev-server
// fetch entirely (that dev port was swept 2026-07-02).

export default function ApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const key = params.id ? decodeURIComponent(params.id) : '';

  const { allTasks, loaded, busyKeys, errorMessage, approve, deny } = useApprovalsInbox();

  const task = React.useMemo(() => allTasks?.find((t) => t.key === key) ?? null, [allTasks, key]);

  const handleDeny = React.useCallback(() => {
    deny(key);
    navigate('/admin/approvals');
  }, [deny, key, navigate]);

  if (!loaded) {
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

  if (!task || task.dispatch_status !== 'queued') {
    return (
      <div className="hds-page-enter">
        <Page>
          <Stack gap="spacious">
            <TextLockup
              eyebrow="Admin · Approval"
              title={`Not awaiting approval: ${key || '(no id)'}`}
              description="No queued task matches this id — it may already have been approved, denied, or was never queued. Return to the inbox to pick another task."
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
              eyebrow={`Admin · Approval · ${task.key}`}
              title={task.title}
              description={`Lane ${task.lane}${task.phase ? ` · ${task.phase}` : ''} · status ${task.status}${task.tier ? ` · tier ${task.tier}` : ''}${task.model ? ` · model ${task.model}` : ''}`}
              size="section"
            />
          </Stack>

          {errorMessage ? (
            <p className="text-sm text-destructive" data-role="approval-detail-error">
              {errorMessage}
            </p>
          ) : null}

          <ApprovalCard
            unit={taskToApprovalUnit(task)}
            pending={busyKeys.has(task.key)}
            showGrill={false}
            onApprove={() => approve(task.key)}
            onDeny={handleDeny}
          />
        </Stack>
      </Page>
    </div>
  );
}
