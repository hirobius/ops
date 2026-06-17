#!/usr/bin/env node
/**
 * client-digest.mjs — weekly status email draft for a given client slug.
 *
 * Walks the last N days of git log restricted to clients/<slug>/, buckets
 * commits into shipped / next / blocker / other, and emits a markdown email
 * draft ready to paste. Solo agencies live on perceived momentum; this
 * makes "what did we do this week?" a one-button task.
 *
 * Input: ${input} = client slug. Optional 2nd arg = window in days
 * (CLI use; skill-runner only passes the primary input).
 *
 * Refs: t_d1fb7fd7 / Client-augment — client-digest
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Parse pipe-delimited `git log --pretty=format:%H|%aI|%s` output into commits.
 *
 * @param {string} text
 * @returns {Array<{ sha: string, date: string, subject: string }>}
 */
export function parseGitLog(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      const [sha, date, ...rest] = line.split('|');
      return { sha, date, subject: rest.join('|') };
    });
}

/** Strip a conventional-commit prefix like "feat(slug): " from a subject. */
function stripPrefix(subject) {
  return subject.replace(/^(feat|fix|refactor|chore|docs|perf|test|build|style)\([^)]+\):\s*/, '');
}

const SHIPPED_PREFIXES = /^(feat|fix|refactor|perf|build)\b/;

export function bucketCommits(commits) {
  const shipped = [];
  const next = [];
  const blocker = [];
  const other = [];
  for (const c of commits) {
    const subj = c.subject;
    if (/\bblocker\b/i.test(subj)) blocker.push(c);
    else if (/\b(todo|next:)\b/i.test(subj)) next.push(c);
    else if (SHIPPED_PREFIXES.test(subj)) shipped.push(c);
    else other.push(c);
  }
  return { shipped, next, blocker, other };
}

/** @param {{ slug: string, period: string, sections: ReturnType<typeof bucketCommits> }} input */
export function formatDigest({ slug, period, sections }) {
  const { shipped, next, blocker, other } = sections;
  const total = shipped.length + next.length + blocker.length + other.length;

  if (total === 0) {
    return [
      `# Weekly digest — ${slug}`,
      '',
      `_Period: ${period}_`,
      '',
      'No activity recorded for this client in the selected window.',
      '',
    ].join('\n');
  }

  const lines = [`# Weekly digest — ${slug}`, '', `_Period: ${period}_`];

  if (shipped.length > 0) {
    lines.push('', '## Shipped', ...shipped.map((c) => `- ${stripPrefix(c.subject)}`));
  }
  if (next.length > 0) {
    lines.push('', '## Next', ...next.map((c) => `- ${stripPrefix(c.subject)}`));
  }
  if (blocker.length > 0) {
    lines.push('', '## Blockers', ...blocker.map((c) => `- ${stripPrefix(c.subject)}`));
  }
  if (other.length > 0) {
    lines.push('', '## Other activity', ...other.map((c) => `- ${stripPrefix(c.subject)}`));
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    process.stderr.write('client-digest: slug required\n');
    process.exit(1);
  }
  const days = Number.parseInt(process.argv[3] ?? '7', 10);
  const period = `${days} days`;

  const { stdout } = await execFileP(
    'git',
    [
      'log',
      `--since=${days}.days.ago`,
      '--pretty=format:%H|%aI|%s',
      '--',
      `clients/${slug}/`,
    ],
    { cwd: REPO_ROOT, maxBuffer: 4 * 1024 * 1024 },
  );

  const commits = parseGitLog(stdout);
  const sections = bucketCommits(commits);
  process.stdout.write(formatDigest({ slug, period, sections }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`client-digest: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
