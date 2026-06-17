/**
 * Board response shape from Hermes' kanban plugin API.
 *
 * Shape is mirrored from
 * `~/.hermes/hermes-agent/plugins/kanban/dashboard/plugin_api.py::get_board`.
 * Only the fields the /ops/kanban page actually consumes are typed; the
 * upstream payload carries more (run history, idempotency keys, workflow
 * step state) that the read-only viewer doesn't need.
 */

export type TaskStatus =
  | 'triage'
  | 'todo'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'done'
  | 'archived';

export interface KanbanDiagnostic {
  level: 'info' | 'warning' | 'error';
  code?: string;
  message: string;
}

export interface KanbanWarningsSummary {
  errors: number;
  warnings: number;
  info: number;
}

export interface KanbanTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: TaskStatus;
  priority: number;
  tenant: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_kind: string | null;
  workspace_path: string | null;
  consecutive_failures: number;
  last_failure_error: string | null;
  skills: string[] | null;
  latest_summary: string | null;
  link_counts: { parents: number; children: number };
  comment_count: number;
  progress: { done: number; total: number } | null;
  diagnostics?: KanbanDiagnostic[];
  warnings?: KanbanWarningsSummary;
}

export interface KanbanColumn {
  name: TaskStatus;
  tasks: KanbanTask[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  tenants: string[];
  assignees: string[];
  latest_event_id: number;
  /** Server-side timestamp at the moment the board was assembled (epoch seconds). */
  now: number;
}
