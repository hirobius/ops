import type { LooseThread, ProposedUnitEntry, PromoteTarget } from './threads-types';

const ENDPOINT = '/api/hermes/tasks';

interface CreateTaskBody {
  title?: string;
  body?: string;
  tenant?: string;
  assignee?: string;
  priority?: number;
  workspace_kind?: 'scratch' | 'worktree' | 'dir';
  workspace_path?: string;
  parents?: string[];
  triage?: boolean;
  idempotency_key?: string;
  skills?: string[];
}

export interface PromoteSuccess { ok: true; taskId: string }
export interface PromoteFailure { ok: false; error: string }
export type PromoteResult = PromoteSuccess | PromoteFailure;

interface BasePromoteInput {
  titleOverride?: string;
  assignee?: string;
  target: PromoteTarget;
}

interface PromoteThreadInput extends BasePromoteInput {
  loose: LooseThread;
}

interface PromoteProposedUnitInput extends BasePromoteInput {
  entry: ProposedUnitEntry;
}

async function postTask(body: CreateTaskBody): Promise<PromoteResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const text = await res.text();
      if (text) detail += `: ${text.slice(0, 240)}`;
    } catch { /* ignore */ }
    return { ok: false, error: detail };
  }
  try {
    const json = (await res.json()) as { task?: { id?: string } };
    if (json?.task?.id) return { ok: true, taskId: json.task.id };
    return { ok: false, error: 'Hermes accepted the request but returned no task id' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function applyTarget(body: CreateTaskBody, target: PromoteTarget): void {
  // Hermes computes status as "ready" if no parents (or all parents done),
  // unless `triage: true` forces triage. We only need to set the flag
  // when the user wanted triage; ready is the implicit default.
  if (target === 'triage') body.triage = true;
}

export async function promoteThread(input: PromoteThreadInput): Promise<PromoteResult> {
  const { loose, titleOverride, assignee, target } = input;

  const body: CreateTaskBody = {
    tenant: 'hds',
  };
  if (assignee && assignee.trim()) body.assignee = assignee.trim();
  applyTarget(body, target);

  if (loose.kind === 'worktree') {
    body.title = (titleOverride ?? loose.basename).slice(0, 240);
    body.body = `Promoted from worktree at \`${loose.path}\` (branch \`${loose.branch}\`).`;
    body.workspace_kind = 'worktree';
    body.workspace_path = loose.path;
    body.idempotency_key = `thread-promote:wt:${loose.basename}`;
  } else {
    const fallbackTitle = loose.firstPrompt?.trim()
      ? loose.firstPrompt.trim().slice(0, 80)
      : `Claude session ${loose.sessionId.slice(0, 8)}`;
    body.title = (titleOverride ?? fallbackTitle).slice(0, 240);
    body.body = [
      `Promoted from Claude Code session.`,
      `\`cwd\`: ${loose.cwd}`,
      `\`gitBranch\`: ${loose.gitBranch ?? '(unknown)'}`,
      `\`sessionId\`: ${loose.sessionId}`,
      loose.firstPrompt ? `\nFirst prompt:\n> ${loose.firstPrompt}` : '',
    ].filter(Boolean).join('\n');
    body.workspace_kind = 'dir';
    body.workspace_path = loose.cwd;
    body.idempotency_key = `thread-promote:sess:${loose.sessionId}`;
  }

  return postTask(body);
}

export async function promoteProposedUnit(input: PromoteProposedUnitInput): Promise<PromoteResult> {
  const { entry, titleOverride, assignee, target } = input;
  const u = entry.proposedUnit;

  const body: CreateTaskBody = {
    tenant: 'hds',
    title: (titleOverride ?? u.name).slice(0, 240),
    body: [
      u.description,
      '',
      u.dependsOn && u.dependsOn.length > 0 ? `**Depends on:** ${u.dependsOn.join(', ')}` : '',
      u.validationCmd ? `**Validation:** \`${u.validationCmd}\`` : '',
      u.agentNotes && u.agentNotes.length > 0 ? `\n**Agent notes:**\n${u.agentNotes.map((n) => `- ${n}`).join('\n')}` : '',
      '',
      `_Promoted from \`docs/ai/proposed-units.jsonl\` · reason: ${entry.reason} · urgency: ${entry.urgency} · proposed by ${entry.fromUnitId}_`,
    ].filter(Boolean).join('\n'),
    workspace_kind: 'scratch',
    idempotency_key: `proposed-unit-promote:${u.id}`,
  };
  if (assignee && assignee.trim()) body.assignee = assignee.trim();
  applyTarget(body, target);

  return postTask(body);
}
