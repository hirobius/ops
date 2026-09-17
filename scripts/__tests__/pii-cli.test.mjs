/**
 * scripts/check-pii.mjs — the PII gate CLI, driven end to end in scratch git
 * repositories. All personal data here is synthetic.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-pii.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

// The environment with every GIT_* variable removed. This suite runs inside git
// hooks (.husky/pre-push runs `pnpm test`), and hooks export GIT_DIR and
// friends. A child `git init` / `git commit` that inherits them acts on the
// ENCLOSING repository, not the temp dir — on 2026-09-16 that committed into
// the real repo and set core.bare=true. PII_DENYLIST and GITHUB_* are removed
// too, so a developer's or runner's real values never leak into a test.
function isolatedEnv(extra = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(GIT_|GITHUB_|PII_DENYLIST)/i.test(name) && name !== 'HDS_FIXTURE_MODE',
    ),
  );
  return { ...env, ...extra };
}

function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'check-pii-'));
  cleanup.push(dir);
  const git = (...args) => {
    const r = spawnSync(
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
      { cwd: dir, encoding: 'utf8', env: isolatedEnv() },
    );
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout.trim();
  };
  git('init', '-q');
  const toplevel = git('rev-parse', '--show-toplevel');
  if (realpathSync(toplevel) !== realpathSync(dir)) {
    throw new Error(`scratch repo resolved to "${toplevel}", not ${dir}: refusing to commit`);
  }
  const write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  return { dir, git, write };
}

function runCli(cwd, args = [], env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    env: isolatedEnv(env),
  });
}

describe('check-pii — proof-of-firing fixtures', () => {
  const fixture = (name) => join(ROOT, 'fixtures', 'check-pii', `${name}.example.json`);

  it('fires on the violating fixture using only its synthetic denylist', () => {
    const result = runCli(ROOT, ['--fixture-mode'], { FIXTURE_FILE: fixture('violating') });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/denylist entry 1 \(fixture\)/);
    expect(result.stdout).toMatch(/private-url: google-workspace/);
    expect(result.stdout).not.toMatch(/Jane Example/i);
  });

  it('passes the passing fixture, and ignores any real denylist in the environment', () => {
    const result = runCli(ROOT, ['--fixture-mode'], {
      FIXTURE_FILE: fixture('passing'),
      PII_DENYLIST: 'studio',
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

describe('check-pii — commit ranges (CI)', () => {
  function branchWithTwoCommits() {
    const repo = scratchRepo();
    repo.write('README.md', 'base\n');
    repo.git('add', 'README.md');
    repo.git('commit', '-q', '-m', 'base');
    const base = repo.git('rev-parse', 'HEAD');
    repo.write('README.md', 'base\nOffice: (999) 234-5678\n');
    repo.git('add', 'README.md');
    repo.git(
      'commit',
      '-q',
      '-m',
      'docs: add office line\n\nSource: https://mail.google.com/mail/u/0/#inbox/SYNTHETIC',
    );
    const head = repo.git('rev-parse', 'HEAD');
    return { repo, base, head };
  }

  it('scans the lines a range adds and its commit messages', () => {
    const { repo, base, head } = branchWithTwoCommits();
    const result = runCli(repo.dir, ['--range', `${base}..HEAD`]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/warn\s+README\.md:2:9\s+phone/);
    expect(result.stdout).toContain(`error  commit ${head.slice(0, 12)} message:3:9  private-url`);
    expect(result.stdout).not.toMatch(/mail\.google|234-5678/);
  });

  it('resolves a push event range, annotates findings and writes a job summary with the denylist notice', () => {
    const { repo, base, head } = branchWithTwoCommits();
    const eventPath = join(repo.dir, 'event.json');
    const summaryPath = join(repo.dir, 'summary.md');
    writeFileSync(eventPath, JSON.stringify({ before: base, after: head }));
    writeFileSync(summaryPath, '');

    const result = runCli(repo.dir, ['--github-event', '--github'], {
      GITHUB_EVENT_NAME: 'push',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_STEP_SUMMARY: summaryPath,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(
      /::warning title=PII denylist::The PII_DENYLIST secret is not set.*https:\/\/github\.com\/hirobius\/ops\/settings\/secrets\/actions/,
    );
    expect(result.stdout).toMatch(/::warning file=README\.md,line=2,col=9,title=PII phone::/);
    expect(result.stdout).toMatch(/::error title=PII private-url::commit [0-9a-f]{12} message:3:9/);
    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toMatch(/### PII scan: /);
    expect(summary).toMatch(/PII_DENYLIST secret is not set/);
    expect(summary + result.stdout).not.toMatch(/mail\.google|234-5678/);
  });

  it('fails loud with exit 2 when the event names a commit the clone does not have', () => {
    const { repo, head } = branchWithTwoCommits();
    const eventPath = join(repo.dir, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({ pull_request: { base: { sha: 'c'.repeat(40) }, head: { sha: head } } }),
    );
    const result = runCli(repo.dir, ['--github-event', '--github'], {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toMatch(/::error title=PII scan could not run::.*fetch-depth: 0/);
  });
});

describe('check-pii — weekly targets', () => {
  function emptyDir() {
    const dir = mkdtempSync(join(tmpdir(), 'check-pii-cwd-'));
    cleanup.push(dir);
    return dir;
  }

  it('scans every tracked text file of another checkout, labelled, without file annotations', () => {
    const repo = scratchRepo();
    repo.write('docs/a.md', 'https://outlook.office.com/mail/inbox/id/SYNTHETIC\n');
    repo.write('src/b.ts', 'const owner = "jane.example@fictional-client.biz";\n');
    repo.write(
      'img.bin',
      Buffer.from([0, 1, 2, 0]).toString('latin1') + 'https://drive.google.com/x/y',
    );
    repo.git('add', 'docs/a.md', 'src/b.ts', 'img.bin');
    repo.git('commit', '-q', '-m', 'tip');
    repo.write('untracked.md', 'https://chat.google.com/room/SYNTHETIC\n');

    const result = runCli(emptyDir(), [
      '--tree',
      repo.dir,
      '--label',
      'portal-kit@main',
      '--github',
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/::error title=PII private-url::portal-kit@main:docs\/a\.md:1:1/);
    expect(result.stdout).toMatch(/::warning title=PII email::portal-kit@main:src\/b\.ts:1:16/);
    expect(result.stdout).not.toMatch(/::(error|warning) file=/);
    expect(result.stdout).not.toMatch(/untracked\.md|img\.bin/);
  });

  it('passes a tree with only warnings when failing on errors', () => {
    const repo = scratchRepo();
    repo.write('src/b.ts', 'const owner = "jane.example@fictional-client.biz";\n');
    repo.git('add', 'src/b.ts');
    repo.git('commit', '-q', '-m', 'tip');
    const result = runCli(emptyDir(), ['--tree', repo.dir, '--fail-on', 'error']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/warn\s+check-pii-[^:\s]+:src\/b\.ts:1:16/);
  });

  it('scans issue-text records and fails on a warning when asked to', () => {
    const dir = emptyDir();
    const records = join(dir, 'records.json');
    writeFileSync(
      records,
      JSON.stringify([
        { location: 'hirobius/ops#12 body', text: 'Ping jane.example@fictional-client.biz' },
        { location: 'hirobius/ops#12 comment 99', text: 'all clear' },
      ]),
    );
    const result = runCli(dir, ['--records', records, '--fail-on', 'warn']);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/warn\s+hirobius\/ops#12 body:1:6\s+email/);
  });

  it('rejects a records file that is not a list of { location, text }', () => {
    const dir = emptyDir();
    const records = join(dir, 'records.json');
    writeFileSync(records, JSON.stringify({ nope: true }));
    const result = runCli(dir, ['--records', records]);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/records file must be a JSON array/);
  });
});

describe('check-pii — staged changes (pre-commit)', () => {
  it('blocks a staged denylist term, printing its location but never the term', () => {
    const repo = scratchRepo();
    repo.write('.pii-denylist', '# synthetic\njane\\s+example\n');
    repo.write('notes.md', 'intro\n');
    repo.git('add', 'notes.md');
    repo.git('commit', '-q', '-m', 'base');
    repo.write('notes.md', 'intro\nJane Example called.\n');
    repo.git('add', 'notes.md');

    const result = runCli(repo.dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/notes\.md:2:1/);
    expect(result.stdout).toMatch(/denylist entry 2 \(\.pii-denylist\)/);
    expect(result.stdout + result.stderr).not.toMatch(/jane/i);
  });

  it("uses the main checkout's .pii-denylist when committing from a linked worktree", () => {
    const repo = scratchRepo();
    repo.write('.gitignore', '.pii-denylist\n');
    repo.write('.pii-denylist', 'example client co\n');
    repo.git('add', '.gitignore');
    repo.git('commit', '-q', '-m', 'base');
    repo.git('worktree', 'add', '-q', '-b', 'session', 'wt');
    const worktree = join(repo.dir, 'wt');
    writeFileSync(join(worktree, 'notes.md'), 'Invoice for Example Client Co\n');
    spawnSync('git', ['add', 'notes.md'], { cwd: worktree, env: isolatedEnv() });

    const result = runCli(worktree);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/notes\.md:1:13\s+denylist entry 1 \(\.pii-denylist\)/);
  });

  it('ignores personal data that was already committed and is not part of the staged change', () => {
    const repo = scratchRepo();
    repo.write('old.md', 'https://docs.google.com/document/d/SYNTHETIC/edit\n');
    repo.git('add', 'old.md');
    repo.git('commit', '-q', '-m', 'base');
    repo.write('new.md', 'nothing personal here\n');
    repo.git('add', 'new.md');

    const result = runCli(repo.dir);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toMatch(/old\.md/);
  });

  it('warns without blocking on an address outside the allowlist, and says the denylist is missing', () => {
    const repo = scratchRepo();
    repo.write('contact.md', 'Reach jane.example@fictional-client.biz\n');
    repo.git('add', 'contact.md');

    const result = runCli(repo.dir);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/warn\s+contact\.md:1:7\s+email/);
    expect(result.stdout).toMatch(
      /No denylist loaded \(PII_DENYLIST unset, \.pii-denylist absent\)/,
    );
    expect(result.stdout).not.toMatch(/fictional-client/);
  });

  it('blocks a staged file whose PATH matches the denylist, and redacts that path', () => {
    const repo = scratchRepo();
    repo.write('clients/jane-example/notes.md', 'hello\n');
    repo.git('add', 'clients/jane-example/notes.md');

    const result = runCli(repo.dir, [], { PII_DENYLIST: 'jane-example' });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/\[path redacted: matches the denylist, sha256 [0-9a-f]{12}\]/);
    expect(result.stdout).toMatch(/denylist entry 1 \(PII_DENYLIST\) in a file path/);
    expect(result.stdout).not.toMatch(/jane/i);
  });

  it('on a merge commit, scans only what the merge itself adds — not what the merged branch already carried', () => {
    const repo = scratchRepo();
    repo.write('base.md', 'base\n');
    repo.git('add', 'base.md');
    repo.git('commit', '-q', '-m', 'base');
    repo.git('branch', '-M', 'main');
    repo.git('checkout', '-q', '-b', 'feature');
    repo.write('feature.md', 'feature work\n');
    repo.git('add', 'feature.md');
    repo.git('commit', '-q', '-m', 'feature');
    repo.git('checkout', '-q', 'main');
    // Landed on main without the gate (the situation ops main is in until the
    // ops#27 rewrite): merging main into a branch must not re-block on it.
    repo.write('main.md', 'Example Client Co onboarding\n');
    repo.git('add', 'main.md');
    repo.git('commit', '-q', '-m', 'main change');
    repo.git('checkout', '-q', 'feature');
    repo.git('merge', '-q', '--no-ff', '--no-commit', 'main');

    const env = { PII_DENYLIST: 'example client co' };
    expect(runCli(repo.dir, [], env).status).toBe(0);

    repo.write('feature.md', 'feature work\nresolution mentions Example Client Co\n');
    repo.git('add', 'feature.md');
    const result = runCli(repo.dir, [], env);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/feature\.md:2:21/);
    expect(result.stdout).not.toMatch(/main\.md/);
  });

  it('blocks committing the denylist file itself, even when it was force-added', () => {
    const repo = scratchRepo();
    repo.write('.gitignore', '.pii-denylist\n');
    repo.write('.pii-denylist', 'example client co\n');
    repo.git('add', '-f', '.pii-denylist');

    const result = runCli(repo.dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/\.pii-denylist is tracked or staged/);
  });

  it('emits the gate-output JSON contract with no values in it', () => {
    const repo = scratchRepo();
    repo.write('a.md', 'https://drive.google.com/drive/folders/SYNTHETIC\n');
    repo.git('add', 'a.md');

    const result = runCli(repo.dir, ['--json']);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.violations).toEqual([
      {
        file: 'a.md',
        line: 1,
        rule: 'pii-private-url',
        severity: 'error',
        message: 'google-workspace (value redacted, 48 chars)',
      },
    ]);
    expect(result.stdout).not.toMatch(/drive\.google|SYNTHETIC/);
  });
});
