/**
 * Contract for .github/workflows/secret-scan.yml — pins the decisions that make
 * the CI secret scan free, trustworthy, and safe to run in a public repo, so a
 * later "simplification" can't quietly undo one of them (ops#32).
 *
 * Assertions run on comment-stripped YAML: a comment mentioning `--redact` is
 * not the same as passing it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripYamlComments } from '../lib/yaml-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = stripYamlComments(
  readFileSync(join(ROOT, '.github', 'workflows', 'secret-scan.yml'), 'utf8'),
);

describe('secret-scan workflow contract', () => {
  it('runs on pull requests and pushes to main, with full history checked out', () => {
    expect(workflow).toMatch(/^\s*pull_request:/m);
    expect(workflow).toMatch(/^\s*push:\s*\n\s*branches:\s*\[main\]/m);
    expect(workflow).toMatch(/fetch-depth:\s*0/);
  });

  it('never uses gitleaks-action, which needs a paid GITLEAKS_LICENSE on organization repos', () => {
    expect(workflow).not.toMatch(/gitleaks\/gitleaks-action/);
    expect(workflow).not.toMatch(/GITLEAKS_LICENSE/);
  });

  it('installs a pinned gitleaks release and verifies its SHA-256 before running it', () => {
    expect(workflow).toMatch(/GITLEAKS_VERSION:\s*['"]?\d+\.\d+\.\d+/);
    expect(workflow).toMatch(/GITLEAKS_SHA256:\s*['"]?[0-9a-f]{64}/);
    expect(workflow).toMatch(/sha256sum (-c|--check)/);
  });

  it('scans only the resolved change range, with the repo config, and redacts findings from the public log', () => {
    expect(workflow).toMatch(/node scripts\/secret-scan-range\.mjs/);
    expect(workflow).toMatch(/--log-opts[= ]"\$LOG_OPTS"/);
    expect(workflow).toMatch(/--config \.gitleaks\.toml/);
    expect(workflow).toMatch(/--redact/);
  });

  // Each run scans only its own range, so every run must finish. A concurrency
  // group cancels a *pending* run whenever a newer one queues, even with
  // cancel-in-progress: false — that silently skips a push's before..after, a
  // queued full-history dispatch, or a PR commit force-pushed away mid-scan.
  it('declares no concurrency group, so no queued or running scan is ever cancelled', () => {
    expect(workflow).not.toMatch(/^\s*concurrency:/m);
    expect(workflow).not.toMatch(/cancel-in-progress/);
  });
});
