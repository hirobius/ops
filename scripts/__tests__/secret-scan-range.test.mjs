import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveScanRange } from '../secret-scan-range.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'secret-scan-range.mjs');

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const everyCommitPresent = () => true;

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

// The environment with every GIT_* variable removed. This suite runs inside
// git hooks (.husky/pre-push runs `pnpm test`), and hooks export GIT_DIR and
// related variables. A child `git init` / `git commit` that inherits them acts
// on the ENCLOSING repository, not the temp dir. On 2026-09-16 that put empty
// commits on the pushing branch and flipped core.bare=true in the shared
// .git/config, which broke the main checkout.
function isolatedGitEnv(extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  return { ...env, ...extra };
}

// A throwaway repo with two real commits, so the CLI's commit-existence
// check runs against actual git objects rather than a stub.
function repoWithTwoCommits() {
  const dir = mkdtempSync(join(tmpdir(), 'secret-scan-range-'));
  cleanup.push(dir);
  const git = (...args) =>
    spawnSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd: dir, encoding: 'utf8', env: isolatedGitEnv() },
    ).stdout.trim();
  git('init', '-q');
  // Fail before committing anything if git resolved some other repository.
  const toplevel = git('rev-parse', '--show-toplevel');
  if (!toplevel || realpathSync(toplevel) !== realpathSync(dir)) {
    throw new Error(`scratch repo resolved to "${toplevel}", not ${dir}: refusing to commit`);
  }
  git('commit', '-q', '--allow-empty', '-m', 'one');
  const first = git('rev-parse', 'HEAD');
  git('commit', '-q', '--allow-empty', '-m', 'two');
  const second = git('rev-parse', 'HEAD');
  return { dir, first, second };
}

function runCli(cwd, eventName, payload) {
  const eventPath = join(cwd, 'event.json');
  const outputPath = join(cwd, 'github-output.txt');
  writeFileSync(eventPath, JSON.stringify(payload));
  writeFileSync(outputPath, '');
  const result = spawnSync('node', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: isolatedGitEnv({
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
    }),
  });
  return { ...result, output: readFileSync(outputPath, 'utf8') };
}

describe('resolveScanRange', () => {
  it('scans only the commits a pull request adds on top of its base', () => {
    const result = resolveScanRange({
      eventName: 'pull_request',
      payload: { pull_request: { base: { sha: BASE }, head: { sha: HEAD } } },
      commitExists: everyCommitPresent,
    });
    expect(result.logOpts).toBe(`${BASE}..${HEAD}`);
  });

  it('scans only the commits a push to main adds on top of the previous tip', () => {
    const result = resolveScanRange({
      eventName: 'push',
      payload: { before: BASE, after: HEAD },
      commitExists: everyCommitPresent,
    });
    expect(result.logOpts).toBe(`${BASE}..${HEAD}`);
  });

  it('falls back to the pushed tip, with a warning, when the push has no previous tip', () => {
    const result = resolveScanRange({
      eventName: 'push',
      payload: { before: '0'.repeat(40), after: HEAD },
      commitExists: everyCommitPresent,
    });
    expect(result.logOpts).toBe(`-1 ${HEAD}`);
    expect(result.warning).toMatch(/only the pushed tip/i);
  });

  it('falls back to the pushed tip when the previous tip is not in the clone (history rewritten)', () => {
    const result = resolveScanRange({
      eventName: 'push',
      payload: { before: BASE, after: HEAD },
      commitExists: (sha) => sha !== BASE,
    });
    expect(result.logOpts).toBe(`-1 ${HEAD}`);
    expect(result.warning).toMatch(/only the pushed tip/i);
  });

  it('fails loud, naming fetch-depth, when a pull request commit is missing from a shallow clone', () => {
    expect(() =>
      resolveScanRange({
        eventName: 'pull_request',
        payload: { pull_request: { base: { sha: BASE }, head: { sha: HEAD } } },
        commitExists: (sha) => sha !== BASE,
      }),
    ).toThrow(/fetch-depth: 0/);
  });

  it('fails loud when the pushed tip itself is missing from the clone', () => {
    expect(() =>
      resolveScanRange({
        eventName: 'push',
        payload: { before: BASE, after: HEAD },
        commitExists: (sha) => sha !== HEAD,
      }),
    ).toThrow(/fetch-depth: 0/);
  });

  it('refuses anything that is not a full commit SHA, since the range is handed to git log as options', () => {
    expect(() =>
      resolveScanRange({
        eventName: 'push',
        payload: { before: '--output=/tmp/pwned', after: HEAD },
      }),
    ).toThrow(/not a 40-character commit SHA/);
  });

  it('scans the full history of the dispatched ref on a manual run', () => {
    const result = resolveScanRange({ eventName: 'workflow_dispatch', payload: {} });
    expect(result.logOpts).toBe('HEAD');
  });

  it('fails loud on an event it has no range rule for, instead of silently scanning nothing', () => {
    expect(() => resolveScanRange({ eventName: 'schedule', payload: {} })).toThrow(
      /no scan range rule for the "schedule" event/,
    );
  });
});

describe('secret-scan-range CLI (GitHub Actions step)', () => {
  it('writes the resolved range to $GITHUB_OUTPUT as log_opts', () => {
    const { dir, first, second } = repoWithTwoCommits();
    const result = runCli(dir, 'push', { before: first, after: second });
    expect(result.status).toBe(0);
    expect(result.output).toBe(`log_opts=${first}..${second}\n`);
  });

  it('fails the step with an error annotation, and writes no range, when a needed commit is absent', () => {
    const { dir, first } = repoWithTwoCommits();
    const result = runCli(dir, 'pull_request', {
      pull_request: { base: { sha: first }, head: { sha: 'c'.repeat(40) } },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/::error title=Secret scan range::.*fetch-depth: 0/);
    expect(result.output).toBe('');
  });

  it('names the missing Actions variables when run outside a workflow', () => {
    const env = { ...process.env };
    // vitest itself may run inside Actions, so strip them explicitly.
    delete env.GITHUB_EVENT_NAME;
    delete env.GITHUB_EVENT_PATH;
    delete env.GITHUB_OUTPUT;
    const result = spawnSync('node', [SCRIPT], { encoding: 'utf8', env });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toMatch(/GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_OUTPUT not set/);
  });
});
