#!/usr/bin/env node
/**
 * activity-log.mjs — recent git activity clustered by conventional-commit
 * scope, ready to paste into a LinkedIn 'now' note, portfolio update, or
 * interview-brief recap.
 *
 * Deterministic v1 — no LLM. Conventional-commit prefixes
 * (feat/fix/refactor/docs/chore/perf(scope)) drive the cluster keys.
 * Anything without a scope falls into "misc".
 *
 * Refs: t_2f4563eb / Self bundle — activity-log
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCOPE_RE = /^(feat|fix|refactor|perf|docs|chore|build|style|test)\(([^)]+)\):\s*(.+)$/;

export function parseGitLog(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [sha, date, ...rest] = line.split('|');
      return { sha, date, subject: rest.join('|') };
    });
}

/**
 * Group commits by the (scope) of their conventional-commit prefix. Commits
 * without a scope fall into the "misc" bucket. Returns a Map preserving
 * first-seen scope order.
 *
 * @param {Array<{ sha: string, date: string, subject: string }>} commits
 */
export function clusterByScope(commits) {
  const clusters = new Map();
  for (const c of commits) {
    const m = c.subject.match(SCOPE_RE);
    const key = m ? m[2] : 'misc';
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(c);
  }
  return clusters;
}

function stripPrefix(subject) {
  const m = subject.match(SCOPE_RE);
  return m ? m[3] : subject;
}

/** @param {{ clusters: Map, period: string, total: number }} input */
export function formatActivityLog({ clusters, period, total }) {
  const lines = [`# Activity log — last ${period}`, ''];
  if (total === 0) {
    lines.push(`No activity in the last ${period}.`);
    return lines.join('\n') + '\n';
  }
  lines.push(`_${total} commit${total === 1 ? '' : 's'} across ${clusters.size} area(s)._`);
  for (const [scope, commits] of clusters) {
    lines.push('', `## ${scope} (${commits.length})`);
    for (const c of commits) lines.push(`- ${stripPrefix(c.subject)}`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const days = Number.parseInt(process.argv[2] ?? '7', 10);
  const { stdout } = await execFileP(
    'git',
    ['log', `--since=${days}.days.ago`, '--pretty=format:%H|%aI|%s'],
    { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
  );
  const commits = parseGitLog(stdout);
  const clusters = clusterByScope(commits);
  process.stdout.write(formatActivityLog({ clusters, period: `${days} days`, total: commits.length }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`activity-log: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
