/**
 * Shared types for /api/threads + /api/proposed-units payloads, the
 * page-side correlation result, and the promote-thread helpers.
 *
 * Source of truth for the wire shapes is the middleware in
 * scripts/threads-middleware.mjs and scripts/proposed-units-middleware.mjs.
 * If those change, update here.
 */

export interface Worktree {
  path: string;
  branch: string;
  commit: string;
  basename: string;
}

export interface LiveSession {
  pid: number | null;
  sessionId: string | null;
  cwd: string;
  status: 'busy' | 'idle';
  updatedAt: number;
  name: string | null;
  gitBranch: string | null;
}

export interface RecentSession {
  sessionId: string;
  cwd: string | null;
  gitBranch: string | null;
  firstPrompt: string | null;
  firstAt: number;
  lastAt: number;
}

export interface ThreadsPayload {
  worktrees: Worktree[];
  liveSessions: LiveSession[];
  recentSessions: RecentSession[];
  now: number;
}

export interface ProposedUnit {
  id: string;
  name: string;
  description: string;
  dependsOn?: string[];
  validationCmd?: string;
  agentNotes?: string[];
  tier?: string;
  model?: string;
  effort?: string;
  safeForUnattended?: boolean;
}

export interface ProposedUnitEntry {
  ts: string;
  fromUnitId: string;
  reason: 'side-quest' | 'blocker' | 'cleanup';
  urgency: string;
  proposedUnit: ProposedUnit;
}

export interface ProposedUnitsPayload {
  items: ProposedUnitEntry[];
  now: number;
}

export type PromoteTarget = 'triage' | 'ready';

export interface ThreadDecoration {
  hasWorktree: boolean;
  worktreePath?: string;
  liveSession?: { sessionId: string | null; status: 'busy' | 'idle'; updatedAt: number; pid: number | null };
  recentSession?: { sessionId: string; lastAt: number };
}

export type LooseThread =
  | { kind: 'worktree'; key: string; path: string; branch: string; basename: string }
  | { kind: 'session'; key: string; sessionId: string; cwd: string; gitBranch: string | null; firstPrompt: string | null; lastAt: number; live: boolean; pid: number | null };
