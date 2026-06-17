import type { KanbanBoard } from './types';
import type { ThreadsPayload, ThreadDecoration, LooseThread } from './threads-types';

const AMBIENT_BRANCHES = new Set(['main', 'fix/ui-pipeline']);
const AMBIENT_BRANCH_PATTERNS: RegExp[] = [/^release\//];

function isAmbientBranch(branch: string): boolean {
  if (AMBIENT_BRANCHES.has(branch)) return true;
  return AMBIENT_BRANCH_PATTERNS.some((re) => re.test(branch));
}

export interface CorrelationResult {
  decorationsByTaskId: Map<string, ThreadDecoration>;
  looseThreads: LooseThread[];
}

/**
 * Build the page-side merge of Hermes board state + threads payload.
 *
 * Decoration: a Hermes task gets a chip on its kanban card if a worktree
 * exists at `.worktrees/<task.id>` OR a Claude session has its `cwd`
 * inside such a worktree. The first matching live session wins; otherwise
 * the most recent past session is attached.
 *
 * Loose threads: any worktree whose basename doesn't match a Hermes task
 * AND whose branch isn't on the ambient allowlist (main, fix/ui-pipeline,
 * release/*) becomes a loose-thread row. Same for sessions whose `cwd`
 * doesn't fall inside any task-mapped worktree.
 */
export function correlateThreads(
  board: KanbanBoard | null,
  threads: ThreadsPayload | null,
): CorrelationResult {
  const decorationsByTaskId = new Map<string, ThreadDecoration>();
  const looseThreads: LooseThread[] = [];

  if (!threads) return { decorationsByTaskId, looseThreads };

  const taskIds = new Set<string>();
  const taskByWorkspacePath = new Map<string, string>(); // workspace_path → task id
  if (board) {
    for (const col of board.columns) {
      for (const t of col.tasks) {
        taskIds.add(t.id);
        if (t.workspace_path) taskByWorkspacePath.set(t.workspace_path, t.id);
      }
    }
  }

  // 1. Worktrees → decoration or loose.
  // Index worktrees by path so sessions can look up "what task does this cwd belong to".
  const worktreeByPath = new Map<
    string,
    { taskId: string | null; worktree: (typeof threads.worktrees)[number] }
  >();
  for (const wt of threads.worktrees) {
    const base = wt.basename;
    // Match by task ID basename OR by workspace_path (catches promoted worktrees).
    const taskId = taskIds.has(base) ? base : (taskByWorkspacePath.get(wt.path) ?? null);
    worktreeByPath.set(wt.path, { taskId, worktree: wt });

    if (taskId) {
      const existing = decorationsByTaskId.get(taskId) ?? { hasWorktree: false };
      decorationsByTaskId.set(taskId, {
        ...existing,
        hasWorktree: true,
        worktreePath: wt.path,
      });
    } else if (!isAmbientBranch(wt.branch)) {
      looseThreads.push({
        kind: 'worktree',
        key: `wt:${wt.basename}`,
        path: wt.path,
        branch: wt.branch,
        basename: wt.basename,
      });
    }
    // Ambient branch + no matching task → silently dropped (it's the
    // main repo on a default branch; not worth surfacing).
  }

  // 2. Live sessions → attach to a task by cwd-in-worktree match, else loose.
  for (const sess of threads.liveSessions) {
    const match = findOwningWorktree(sess.cwd, worktreeByPath);
    if (match?.taskId) {
      const existing = decorationsByTaskId.get(match.taskId) ?? {
        hasWorktree: true,
        worktreePath: match.worktree.path,
      };
      // Prefer busy over idle, then highest updatedAt.
      const incoming = {
        sessionId: sess.sessionId,
        status: sess.status,
        updatedAt: sess.updatedAt,
        pid: sess.pid,
      };
      const current = existing.liveSession;
      const winner =
        !current ||
        (incoming.status === 'busy' && current.status !== 'busy') ||
        (incoming.status === current.status && incoming.updatedAt > current.updatedAt)
          ? incoming
          : current;
      decorationsByTaskId.set(match.taskId, {
        ...existing,
        liveSession: winner,
      });
    } else if (sess.sessionId) {
      // Session in main repo on an ambient branch → don't loose-list it
      // either; that's just "Claude open in the project."
      const ownedByAmbient = match && match.worktree && isAmbientBranch(match.worktree.branch);
      if (ownedByAmbient) continue;
      looseThreads.push({
        kind: 'session',
        key: `sess:${sess.sessionId}`,
        sessionId: sess.sessionId,
        cwd: sess.cwd,
        gitBranch: sess.gitBranch,
        firstPrompt: null,
        lastAt: sess.updatedAt,
        live: true,
        pid: sess.pid,
      });
    }
  }

  // 3. Recent (non-live) sessions → attach as `recentSession` only when
  // no live session is already attached, so the chip is "live > recent".
  for (const sess of threads.recentSessions) {
    const cwd = sess.cwd ?? '';
    const match = cwd ? findOwningWorktree(cwd, worktreeByPath) : null;
    if (match?.taskId) {
      const existing = decorationsByTaskId.get(match.taskId) ?? {
        hasWorktree: true,
        worktreePath: match.worktree.path,
      };
      if (existing.liveSession) continue;
      const current = existing.recentSession;
      if (!current || sess.lastAt > current.lastAt) {
        decorationsByTaskId.set(match.taskId, {
          ...existing,
          recentSession: { sessionId: sess.sessionId, lastAt: sess.lastAt },
        });
      }
    } else {
      const ownedByAmbient = match && match.worktree && isAmbientBranch(match.worktree.branch);
      if (ownedByAmbient) continue;
      looseThreads.push({
        kind: 'session',
        key: `sess:${sess.sessionId}`,
        sessionId: sess.sessionId,
        cwd: cwd,
        gitBranch: sess.gitBranch,
        firstPrompt: sess.firstPrompt,
        lastAt: sess.lastAt,
        live: false,
        pid: null,
      });
    }
  }

  // Stable iteration: most-recent first.
  looseThreads.sort((a, b) => {
    const aT = a.kind === 'session' ? a.lastAt : 0;
    const bT = b.kind === 'session' ? b.lastAt : 0;
    if (aT !== bT) return bT - aT;
    return a.key.localeCompare(b.key);
  });

  // Dedupe loose thread keys (a session may match both live + recent if
  // live-table polling and JSONL mtime both flag it).
  const seen = new Set<string>();
  const dedup: LooseThread[] = [];
  for (const t of looseThreads) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    dedup.push(t);
  }

  return { decorationsByTaskId, looseThreads: dedup };
}

function findOwningWorktree(
  cwd: string,
  worktreeByPath: Map<
    string,
    { taskId: string | null; worktree: { path: string; basename: string; branch: string } }
  >,
): { taskId: string | null; worktree: { path: string; basename: string; branch: string } } | null {
  // Longest-prefix match so /home/foo/.worktrees/bar/x beats /home/foo.
  let best: {
    taskId: string | null;
    worktree: { path: string; basename: string; branch: string };
  } | null = null;
  let bestLen = -1;
  for (const [wtPath, entry] of worktreeByPath) {
    if (cwd === wtPath || cwd.startsWith(wtPath + '/')) {
      if (wtPath.length > bestLen) {
        bestLen = wtPath.length;
        best = entry;
      }
    }
  }
  return best;
}
