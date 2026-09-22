import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  scanRepoWorkflows,
  reconcileSecrets,
  ALLOWLIST,
  FLEET_REPO_DIRS,
  REPO_NAME_MAP,
  main,
} from '../check-secret-registry.mjs';

const REAL_REGISTRY = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../docs/secrets/registry.json'),
    'utf8',
  ),
).secrets;

describe('scanRepoWorkflows', () => {
  let dir;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('reports a repo directory absent from disk', () => {
    dir = mkdtempSync(join(tmpdir(), 'secret-registry-'));
    const result = scanRepoWorkflows(join(dir, 'does-not-exist'));
    expect(result).toEqual({ present: false, workflowsDir: false, refs: new Map() });
  });

  it('reports a repo present but with no .github/workflows directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'secret-registry-'));
    mkdirSync(join(dir, 'repo'), { recursive: true });
    const result = scanRepoWorkflows(join(dir, 'repo'));
    expect(result).toEqual({ present: true, workflowsDir: false, refs: new Map() });
  });

  it('collects secrets.NAME references, deduplicated per name, across workflow files', () => {
    dir = mkdtempSync(join(tmpdir(), 'secret-registry-'));
    const wf = join(dir, 'repo', '.github', 'workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(
      join(wf, 'a.yml'),
      'env:\n  A: ${{ secrets.FOO_TOKEN }}\n  B: ${{ secrets.BAR_KEY }}\n',
    );
    writeFileSync(join(wf, 'b.yml'), 'env:\n  A: ${{ secrets.FOO_TOKEN }}\n');
    const result = scanRepoWorkflows(join(dir, 'repo'));
    expect(result.present).toBe(true);
    expect(result.workflowsDir).toBe(true);
    expect([...result.refs.keys()].sort()).toEqual(['BAR_KEY', 'FOO_TOKEN']);
    expect(result.refs.get('FOO_TOKEN').sort()).toEqual(['a.yml', 'b.yml']);
  });

  it('matches a bare placeholder like `secrets.X` — the exact naive-grep gotcha ALLOWLIST exists to handle', () => {
    dir = mkdtempSync(join(tmpdir(), 'secret-registry-'));
    const wf = join(dir, 'repo', '.github', 'workflows');
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, 'release.yml'), "# why not: if: ${{ secrets.X == '' }}\n");
    const result = scanRepoWorkflows(join(dir, 'repo'));
    expect([...result.refs.keys()]).toEqual(['X']);
  });
});

describe('ALLOWLIST', () => {
  it('every entry carries a non-trivial reason', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('covers GITHUB_TOKEN and the literal secrets.X prose case', () => {
    const names = ALLOWLIST.map((a) => a.name);
    expect(names).toContain('GITHUB_TOKEN');
    expect(names).toContain('X');
  });
});

describe('reconcileSecrets', () => {
  const registryEntries = [
    { name: 'FOO_TOKEN', repo: 'hirobius/repo-a' },
    { name: 'BAR_KEY', repo: 'hirobius/repo-a' },
  ];

  it('passes clean when every reference is registered and every entry is referenced', () => {
    const scanByRepo = {
      'hirobius/repo-a': {
        present: true,
        workflowsDir: true,
        refs: new Map([
          ['FOO_TOKEN', ['a.yml']],
          ['BAR_KEY', ['a.yml']],
        ]),
      },
    };
    const { violations } = reconcileSecrets({ scanByRepo, registryEntries });
    expect(violations).toEqual([]);
  });

  it('CANARY — flags a referenced secret with no registry entry, and the run must be non-zero', () => {
    const scanByRepo = {
      'hirobius/repo-a': {
        present: true,
        workflowsDir: true,
        refs: new Map([
          ['FOO_TOKEN', ['a.yml']],
          ['UNREGISTERED_SECRET', ['a.yml']],
        ]),
      },
    };
    const { violations } = reconcileSecrets({ scanByRepo, registryEntries });
    const found = violations.find((v) => v.rule === 'unregistered-secret');
    expect(found).toBeTruthy();
    expect(found.severity).toBe('error');
    expect(found.name).toBe('UNREGISTERED_SECRET');
    expect(found.message).toContain('hirobius/repo-a');
    expect(found.message).toContain('UNREGISTERED_SECRET');
    expect(found.message).toContain('a.yml');
    // This is the assertion that matters: a real caller (main()) treats any
    // 'unregistered-secret' finding as blocking.
    const blocking = violations.filter((v) => v.rule !== 'repo-absent');
    expect(blocking.length).toBeGreaterThan(0);
  });

  it('flags a registry entry nothing references', () => {
    const scanByRepo = {
      'hirobius/repo-a': {
        present: true,
        workflowsDir: true,
        refs: new Map([['FOO_TOKEN', ['a.yml']]]), // BAR_KEY never referenced
      },
    };
    const { violations } = reconcileSecrets({ scanByRepo, registryEntries });
    const found = violations.find((v) => v.rule === 'unreferenced-registry-entry');
    expect(found).toBeTruthy();
    expect(found.name).toBe('BAR_KEY');
    expect(found.severity).toBe('error');
  });

  it('does not accuse an absent repo of having an unreferenced entry — it cannot know either way', () => {
    const scanByRepo = {
      'hirobius/repo-a': { present: false, workflowsDir: false, refs: new Map() },
    };
    const { violations } = reconcileSecrets({ scanByRepo, registryEntries });
    expect(violations.find((v) => v.rule === 'unreferenced-registry-entry')).toBeUndefined();
    expect(violations.find((v) => v.rule === 'repo-absent')).toBeTruthy();
  });

  it('a repo-absent finding alone does not count as blocking', () => {
    const scanByRepo = {
      'hirobius/repo-a': { present: false, workflowsDir: false, refs: new Map() },
    };
    // No registry entries at all for this repo, so nothing else fires.
    const { violations } = reconcileSecrets({ scanByRepo, registryEntries: [] });
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('repo-absent');
    expect(violations[0].severity).toBe('warn');
  });

  it('an allowlisted name never needs a registry entry, even though it textually matches', () => {
    const scanByRepo = {
      'hirobius/repo-a': {
        present: true,
        workflowsDir: true,
        refs: new Map([
          ['FOO_TOKEN', ['a.yml']],
          ['BAR_KEY', ['a.yml']],
          ['GITHUB_TOKEN', ['a.yml']],
        ]),
      },
    };
    const { violations } = reconcileSecrets({ scanByRepo, registryEntries });
    expect(violations.find((v) => v.name === 'GITHUB_TOKEN')).toBeUndefined();
  });
});

describe('main — end-to-end against the real fleet checkout in this sandbox', () => {
  it('passes clean against the real docs/secrets/registry.json and the sibling repos on disk', () => {
    // No FLEET_ROOT override: this exercises the exact code path CI/an operator
    // would run, against the real registry and the real sibling checkouts.
    const code = main(['node', 'check-secret-registry.mjs']);
    expect(code).toBe(0);
  });
});

describe('main — CANARY: a synthetic fleet with one unregistered secret must fail the run', () => {
  let fleetRoot;
  const originalFleetRoot = process.env.FLEET_ROOT;

  afterEach(() => {
    if (fleetRoot) rmSync(fleetRoot, { recursive: true, force: true });
    fleetRoot = undefined;
    if (originalFleetRoot === undefined) delete process.env.FLEET_ROOT;
    else process.env.FLEET_ROOT = originalFleetRoot;
  });

  it('builds a fixture fleet that mirrors every REAL registry entry, adds one bogus secret, and asserts the real CLI exits 1', () => {
    fleetRoot = mkdtempSync(join(tmpdir(), 'secret-registry-canary-'));

    // Mirror the real registry exactly (one workflow per repo referencing
    // every name registered for it) so the ONLY violation possible is the
    // bogus one we add — a clean signal, not noise from unrelated repos.
    const byRepo = new Map();
    for (const entry of REAL_REGISTRY) {
      if (!byRepo.has(entry.repo)) byRepo.set(entry.repo, []);
      byRepo.get(entry.repo).push(entry.name);
    }

    for (const dirName of FLEET_REPO_DIRS) {
      const repo = REPO_NAME_MAP[dirName];
      const names = byRepo.get(repo) ?? [];
      const wf = join(fleetRoot, dirName, '.github', 'workflows');
      mkdirSync(wf, { recursive: true });
      const lines = names.map((n) => `  ${n}: \${{ secrets.${n} }}`).join('\n');
      writeFileSync(join(wf, 'mirror.yml'), `env:\n${lines || '  NOOP: "1"'}\n`);
    }

    // The canary: one secret referenced nowhere in docs/secrets/registry.json.
    const opsWf = join(fleetRoot, 'ops', '.github', 'workflows');
    writeFileSync(
      join(opsWf, 'canary.yml'),
      'env:\n  CANARY: ${{ secrets.TOTALLY_UNREGISTERED_CANARY_SECRET }}\n',
    );

    process.env.FLEET_ROOT = fleetRoot;

    let stderrOut = '';
    const originalError = console.error;
    console.error = (...args) => {
      stderrOut += args.join(' ') + '\n';
    };
    let code;
    try {
      code = main(['node', 'check-secret-registry.mjs']);
    } finally {
      console.error = originalError;
    }

    // The real assertion: RED, not just "some object had a violation".
    expect(code).toBe(1);
    expect(stderrOut).toContain('unregistered-secret');
    expect(stderrOut).toContain('TOTALLY_UNREGISTERED_CANARY_SECRET');
  });
});
