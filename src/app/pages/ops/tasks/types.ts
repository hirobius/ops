/**
 * Types for the /ops/tasks board. Mirrors the consolidated Supabase `tasks` table
 * (supabase/migrations/0003_tasks.sql). Read via GET /api/tasks; mutated via
 * POST /api/task-action.
 */

export type TaskStatus = 'open' | 'blocked' | 'done';

export interface Task {
  id: string;
  key: string;
  source: string; // tracker | backlog | client
  native_key: string | null;
  lane: string;
  group: string | null;
  phase: string | null;
  title: string;
  status: TaskStatus;
  raw_status: string | null;
  derived: string | null;
  stage: string | null;
  priority: 'high' | 'med' | 'low' | null;
  due: string | null;
  owner: string | null;
  effort: 'S' | 'M' | 'L' | null;
  tags: string[] | null;
  deps: string[] | null;
  blocked_by: string[] | null;
  notes: unknown;
  subtasks: unknown;
  import_flags: string[] | null;
  sort_order: number | null;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  dispatch_url: string | null;
  // Provenance — where an imported task came from (e.g. the GitHub issue URL a
  // github:* row was imported from). Distinct from dispatch_url, which is only
  // set once the task is actually dispatched (ops#105).
  source_url: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Fleet auto-dispatch fields (supabase/migrations/0008_task_dispatch.sql,
  // epic #41). tier/model are computed by lib/tasks/tier.mjs::routeTask —
  // Slice 1 only stores + renders them; Slice 2 adds the dispatcher that
  // writes them and drives dispatch_status through its lifecycle.
  auto_ok: boolean | null;
  tier: 'mechanical' | 'standard' | 'judgment' | null;
  model: 'sonnet' | 'opus' | null;
  dispatch_status: 'queued' | 'dispatched' | 'running' | 'done' | 'failed' | null;
  dispatch_count: number | null;
  last_dispatched_at: string | null;
}

export type TaskAction =
  | 'done'
  | 'reopen'
  | 'claim'
  | 'unclaim'
  | 'trash'
  | 'restore'
  | 'dispatch'
  | 'auto_on'
  | 'auto_off'
  | 'queue'
  | 'unqueue'
  | 'ralph_ready_on'
  | 'ralph_ready_off'
  | 'ralph_approve';

export interface TasksResponse {
  tasks: Task[];
}
