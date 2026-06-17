#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/generate-changelog.mjs
 *
 * Parse git log using conventional-commit format and generate CHANGELOG.md.
 * Groups commits by type (feat/fix/perf/refactor/docs/test/chore/other).
 * Respects git tags; unreleased commits appear in an "Unreleased" section.
 *
 * Usage:
 *   node scripts/generate-changelog.mjs          # Last 200 commits
 *   node scripts/generate-changelog.mjs --all    # All commits, no truncation
 *
 * Exit codes:
 *   0 — success
 *   1 — error
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
const args = process.argv.slice(2);
const includeAll = args.includes('--all');

// Conventional-commit regex: type(scope)?: subject
const commitRegex =
  /^(feat|fix|perf|refactor|docs|test|chore|style|ci|build|revert)(\([^)]*\))?\s*:\s*(.+)$/;

// Type priority for ordering sections (higher = appears first)
const typePriority = {
  feat: 10,
  fix: 9,
  perf: 8,
  refactor: 7,
  docs: 6,
  test: 5,
  chore: 4,
  ci: 3,
  build: 3,
  style: 2,
  revert: 1,
};

// Display names for section headers
const typeDisplay = {
  feat: 'Features',
  fix: 'Bug Fixes',
  perf: 'Performance',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  chore: 'Chores',
  style: 'Styling',
  ci: 'CI',
  build: 'Build',
  revert: 'Reverts',
};

/**
 * Parse commit type and scope from subject.
 * @param {string} subject
 * @returns {object} { type, scope, title }
 */
function parseCommit(subject) {
  const match = subject.match(commitRegex);
  if (!match) {
    return { type: 'other', scope: null, title: subject };
  }
  const [, type, scopeStr, title] = match;
  const scope = scopeStr ? scopeStr.slice(1, -1) : null; // strip parens
  return { type, scope, title };
}

/**
 * Format a single commit for the changelog.
 * @param {object} commit { sha, subject, date, type, scope, title }
 * @returns {string}
 */
function formatCommit(commit) {
  const shortSha = commit.sha.slice(0, 7);
  if (commit.scope) {
    return `- **${commit.scope}:** ${commit.title} ([${shortSha}](#))`;
  }
  return `- ${commit.title} ([${shortSha}](#))`;
}

/**
 * Get all commits from git log.
 * @returns {array} array of { sha, date, subject }
 */
function getCommits() {
  try {
    const output = execSync(
      "git log --pretty=format:'%H|%ad|%s' --date=short",
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [sha, date, ...subjectParts] = line.split('|');
        return {
          sha,
          date,
          subject: subjectParts.join('|'), // rejoin in case subject has pipes
        };
      });
  } catch (err) {
    console.error('Error running git log:', err.message);
    process.exit(1);
  }
}

/**
 * Get all git tags, sorted by date descending (newest first).
 * @returns {array} array of tag names
 */
function getTags() {
  try {
    const output = execSync('git tag -l --sort=-creatordate', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.split('\n').filter((tag) => tag.trim());
  } catch {
    return [];
  }
}

/**
 * Find the commit SHA for a tag.
 * @param {string} tag
 * @returns {string|null}
 */
function getTagSha(tag) {
  try {
    const sha = execSync(`git rev-list -n 1 ${tag}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return sha;
  } catch {
    return null;
  }
}

/**
 * Build groups of commits by type, respecting tag boundaries.
 * @param {array} commits
 * @returns {object} { unreleased: {...}, releases: [...] }
 */
function groupCommits(commits) {
  const tags = getTags();
  const tagShas = new Map();
  tags.forEach((tag) => {
    const sha = getTagSha(tag);
    if (sha) tagShas.set(sha, tag);
  });

  const releases = [];
  let currentRelease = null;
  let currentIdx = 0;

  // If there are tags, split commits by tag boundaries
  if (tags.length > 0) {
    for (const tag of tags) {
      const tagSha = tagShas.get(tag);
      if (!tagSha) continue;

      // Find the index of this tag's commit
      const tagIdx = commits.findIndex((c) => c.sha === tagSha);
      if (tagIdx === -1) continue;

      // Collect commits between previous tag and this tag
      const rangeCommits = commits.slice(currentIdx, tagIdx);
      if (rangeCommits.length > 0) {
        currentRelease = {
          tag,
          commits: groupByType(rangeCommits),
          date: rangeCommits[0].date,
        };
        releases.push(currentRelease);
      }

      currentIdx = tagIdx + 1;
    }
  }

  // Remaining commits go into "Unreleased"
  const unreleased = commits.slice(currentIdx);
  const unreleasedGroups = unreleased.length > 0 ? groupByType(unreleased) : {};

  return {
    unreleased: unreleasedGroups,
    releases,
  };
}

/**
 * Group commits by type.
 * @param {array} commits
 * @returns {object} { feat: [...], fix: [...], ... }
 */
function groupByType(commits) {
  const groups = {};
  commits.forEach((commit) => {
    const parsed = parseCommit(commit.subject);
    const type = parsed.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push({ ...commit, ...parsed });
  });
  return groups;
}

/**
 * Render a single release section.
 * @param {object} release { tag, commits, date }
 * @returns {string}
 */
function renderRelease(release) {
  const lines = [`## ${release.tag} (${release.date})\n`];
  const sortedTypes = Object.keys(release.commits).sort(
    (a, b) => (typePriority[b] || 0) - (typePriority[a] || 0)
  );

  sortedTypes.forEach((type) => {
    const commits = release.commits[type];
    const displayName = typeDisplay[type] || type;
    lines.push(`### ${displayName}`);
    lines.push('');
    commits.forEach((commit) => {
      lines.push(formatCommit(commit));
    });
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Render the "Unreleased" section.
 * @param {object} groups
 * @returns {string}
 */
function renderUnreleased(groups) {
  if (Object.keys(groups).length === 0) {
    return '';
  }

  const lines = ['## Unreleased\n'];
  const sortedTypes = Object.keys(groups).sort(
    (a, b) => (typePriority[b] || 0) - (typePriority[a] || 0)
  );

  sortedTypes.forEach((type) => {
    const commits = groups[type];
    const displayName = typeDisplay[type] || type;
    lines.push(`### ${displayName}`);
    lines.push('');
    commits.forEach((commit) => {
      lines.push(formatCommit(commit));
    });
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * Main function.
 */
function main() {
  try {
    let commits = getCommits();

    // Truncate to 200 commits unless --all is specified
    let truncated = false;
    if (!includeAll && commits.length > 200) {
      commits = commits.slice(0, 200);
      truncated = true;
    }

    const { unreleased, releases } = groupCommits(commits);

    const lines = [
      '# Changelog',
      '',
      'Generated by scripts/generate-changelog.mjs from git history. Re-run after merges.',
      '',
    ];

    // Unreleased section
    const unreleasedText = renderUnreleased(unreleased);
    if (unreleasedText) {
      lines.push(unreleasedText);
    }

    // Release sections
    releases.forEach((release) => {
      lines.push(renderRelease(release));
    });

    // Truncation notice
    if (truncated) {
      lines.push(
        '_Older history truncated. Run with --all to see full log._'
      );
      lines.push('');
    }

    const content = lines.join('\n');
    fs.writeFileSync(changelogPath, content, 'utf-8');

    // Count sections (groups with commits)
    const totalSections = Object.keys(unreleased).length + releases.length;
    console.log(
      `✓ wrote CHANGELOG.md (${commits.length} commits, ${totalSections} sections)`
    );
    process.exit(0);
  } catch (err) {
    console.error('Error generating changelog:', err.message);
    process.exit(1);
  }
}

main();
