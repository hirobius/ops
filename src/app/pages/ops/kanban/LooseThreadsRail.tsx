/* hds-bypass: ops-internal page */

import { useState, type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Button } from '@hirobius/design-system';
import type { LooseThread } from './threads-types';
import { promoteThread, type PromoteResult } from './promoteThread';
import { PromotePopover } from './PromotePopover';

interface LooseThreadsRailProps {
  threads: LooseThread[];
  assignees: string[];
  onPromoted: () => void;
}

function relativeAge(epochMs: number): string {
  const delta = Math.max(0, Date.now() - epochMs);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const BRANCH_ASSIGNEE: Array<[RegExp, string]> = [
  [/^feat\//, 'frontend-eng'],
  [/^fix\//, 'frontend-eng'],
  [/^docs?\//, 'docs-writer'],
  [/^arch\//, 'architect'],
  [/^refactor\//, 'architect'],
  [/^chore\//, 'backend-eng'],
  [/^validate\//, 'validator-author'],
  [/^check\//, 'validator-author'],
];

function inferAssignee(branch: string | null): string {
  if (!branch) return '';
  for (const [re, assignee] of BRANCH_ASSIGNEE) {
    if (re.test(branch)) return assignee;
  }
  return '';
}

function shortPath(p: string): string {
  const parts = p.replace(/\/$/, '').split('/');
  return parts.slice(-2).join('/');
}

function defaultTitleFor(t: LooseThread): string {
  if (t.kind === 'worktree') return t.basename;
  if (t.firstPrompt?.trim()) return t.firstPrompt.trim().slice(0, 80);
  if (t.gitBranch) return t.gitBranch;
  if (t.cwd) return shortPath(t.cwd);
  return `session ${t.sessionId.slice(0, 8)}`;
}

export function LooseThreadsRail({ threads, assignees, onPromoted }: LooseThreadsRailProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (threads.length === 0) return null;

  return (
    <section style={s.root} aria-labelledby="loose-threads-eyebrow">
      <header style={s.header}>
        <span id="loose-threads-eyebrow" style={s.eyebrow}>
          loose threads
        </span>
        <span style={s.count}>{threads.length}</span>
        <span style={s.subtitle}>
          worktrees and Claude sessions not yet tracked as Hermes tasks
        </span>
      </header>
      <div style={s.list}>
        {threads.map((t, idx) => (
          <div
            key={t.key}
            style={{
              ...s.row,
              borderBottom:
                idx === threads.length - 1
                  ? 'none'
                  : '1px solid var(--semantic-color-border-default)',
            }}
          >
            <span style={s.kindIcon} aria-hidden="true">
              {t.kind === 'worktree' ? '📁' : t.kind === 'session' && t.live ? '●' : '○'}
            </span>
            <div style={s.identity}>
              <span style={s.title}>{defaultTitleFor(t)}</span>
              <span style={s.meta}>
                {t.kind === 'worktree'
                  ? `${t.branch} · ${shortPath(t.path)}`
                  : `${t.gitBranch ?? '(no branch)'} · ${shortPath(t.cwd)}`}
              </span>
            </div>
            <span style={s.age}>
              {t.kind === 'session' ? relativeAge(t.lastAt) : ''}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpenKey(openKey === t.key ? null : t.key)}
              aria-expanded={openKey === t.key}
            >
              {openKey === t.key ? 'cancel' : 'promote'}
            </Button>
            {openKey === t.key && (
              <div style={s.popoverAnchor}>
                <PromotePopover
                  defaultTitle={defaultTitleFor(t)}
                  defaultAssignee={inferAssignee(t.kind === 'worktree' ? t.branch : t.gitBranch)}
                  assignees={assignees}
                  onClose={() => setOpenKey(null)}
                  hint={
                    t.kind === 'worktree' ? (
                      <>
                        Lands on the <code style={s.code}>hds</code> board with workspace_path set
                        to the worktree.
                      </>
                    ) : (
                      <>
                        Lands on the <code style={s.code}>hds</code> board with workspace_path set
                        to the session cwd.
                      </>
                    )
                  }
                  onConfirm={async ({
                    titleOverride,
                    assignee,
                    target,
                  }): Promise<PromoteResult> => {
                    const result = await promoteThread({
                      loose: t,
                      titleOverride,
                      assignee,
                      target,
                    });
                    if (result.ok) onPromoted();
                    return result;
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    paddingBottom: hds.space.px16,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  header: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  eyebrow: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: section kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  count: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  subtitle: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    position: 'relative' as const,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', // grid-ok: icon + identity + age + action
    columnGap: hds.space.px12,
    rowGap: 0,
    alignItems: 'center',
    padding: `${hds.space.px8} 0`,
    minWidth: 0,
  },
  kindIcon: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    width: '20px',
    textAlign: 'center' as const,
    color: 'var(--semantic-color-content-accent)',
  },
  identity: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px2,
    minWidth: 0,
  },
  title: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  age: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-disabled)',
    whiteSpace: 'nowrap',
  },
  popoverAnchor: {
    gridColumn: '1 / -1',
    marginTop: hds.space.px8,
    paddingTop: hds.space.px8,
    display: 'flex',
    justifyContent: 'flex-start',
  },
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    background: 'var(--semantic-color-surface-page)',
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[2],
  },
} satisfies Record<string, CSSProperties>;
