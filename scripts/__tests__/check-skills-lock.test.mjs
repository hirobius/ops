import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-skills-lock.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'check-skills-lock-'));
  cleanup.push(dir);
  return dir;
}

// Runs the gate in fixture mode against a scratch lock file, the same
// FIXTURE_FILE / HDS_FIXTURE_MODE contract check-guardrail-drift.mjs uses.
function run(lockPath, extraArgs = []) {
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--fixture-mode', ...extraArgs], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: lockPath, HDS_FIXTURE_MODE: '1' },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = (err.stdout ?? '') + (err.stderr ?? '');
  }
  return { code, stdout };
}

function writeLock(dir, skills) {
  const path = join(dir, 'skills-lock.json');
  writeFileSync(path, JSON.stringify({ version: 1, skills }));
  return path;
}

function installSkill(dir, id, content) {
  const skillDir = join(dir, '.claude', 'skills', id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), content);
}

describe('check-skills-lock', () => {
  it('passes when the installed skill matches the lock', () => {
    const dir = tmp();
    const content = 'demo skill content\n';
    installSkill(dir, 'demo', content);
    const hash = createHash('sha256').update(content).digest('hex');
    const lockPath = writeLock(dir, {
      demo: {
        source: 'owner/repo',
        sourceType: 'github',
        skillPath: 'skills/demo/SKILL.md',
        computedHash: hash,
      },
    });

    const { code, stdout } = run(lockPath);
    expect(code).toBe(0);
    expect(stdout).toContain('1 skill(s) match the lock');
  });

  it('fails when the skill is not installed', () => {
    const dir = tmp();
    const lockPath = writeLock(dir, {
      demo: {
        source: 'owner/repo',
        sourceType: 'github',
        skillPath: 'skills/demo/SKILL.md',
        computedHash: 'x'.repeat(64),
      },
    });

    const { code, stdout } = run(lockPath);
    expect(code).toBe(1);
    expect(stdout).toContain('SKILL_MISSING');
    expect(stdout).toContain('install-skills.mjs');
  });

  it('fails when the installed skill has drifted from the pinned hash', () => {
    const dir = tmp();
    installSkill(dir, 'demo', 'drifted content\n');
    const lockPath = writeLock(dir, {
      demo: {
        source: 'owner/repo',
        sourceType: 'github',
        skillPath: 'skills/demo/SKILL.md',
        computedHash: 'x'.repeat(64),
      },
    });

    const { code, stdout } = run(lockPath);
    expect(code).toBe(1);
    expect(stdout).toContain('SKILL_HASH_DRIFT');
  });

  it('emits machine-readable JSON on stdout with --json', () => {
    const dir = tmp();
    const lockPath = writeLock(dir, {
      demo: {
        source: 'owner/repo',
        sourceType: 'github',
        skillPath: 'skills/demo/SKILL.md',
        computedHash: 'x'.repeat(64),
      },
    });

    const { code, stdout } = run(lockPath, ['--json']);
    expect(code).toBe(1);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.violations).toHaveLength(1);
    expect(parsed.violations[0].rule).toBe('SKILL_MISSING');
  });
});
