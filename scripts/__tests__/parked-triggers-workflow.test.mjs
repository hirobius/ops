/**
 * Contract for .github/workflows/parked-triggers.yml (ops#319).
 *
 * The header of that file promises the Discord page is loud when it fails —
 * "a missing secret or a dead webhook prints a notice". The first version could
 * not keep that promise: inline `curl -sS` exits 0 on HTTP 401/404, so a revoked
 * webhook was reported as a successful page. The promise is kept by delegating
 * to scripts/discord-page.mjs, which checks the response status
 * (scripts/__tests__/discord-page.test.mjs proves that end).
 *
 * Assertions run on comment-stripped YAML: a comment describing a behaviour is
 * not the same as a step performing it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripYamlComments } from '../lib/yaml-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflow = stripYamlComments(
  readFileSync(join(ROOT, '.github', 'workflows', 'parked-triggers.yml'), 'utf8'),
);

describe('parked-triggers workflow contract', () => {
  it('runs daily on a schedule, is dispatchable by hand, and needs no write access', () => {
    expect(workflow).toMatch(/^\s*schedule:\s*\n\s*- cron: '0 13 \* \* \*'/m);
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).toMatch(/permissions:\s*\n\s*contents: read/);
  });

  it('runs the gate itself and keeps its output for the page to relay', () => {
    expect(workflow).toMatch(/set -o pipefail/);
    expect(workflow).toMatch(/node scripts\/check-parked-triggers\.mjs 2>&1 \| tee/);
    expect(workflow).toMatch(/\$RUNNER_TEMP\/parked\.txt/);
  });

  it('pages Discord only when the gate failed, handing it the run URL and what fired', () => {
    expect(workflow).toMatch(/if: failure\(\)/);
    expect(workflow).toMatch(/node scripts\/discord-page\.mjs/);
    expect(workflow).toMatch(/--title/);
    expect(workflow).toMatch(/--url "\$RUN_URL"/);
    expect(workflow).toMatch(/--detail-file "\$RUNNER_TEMP\/parked\.txt"/);
    expect(workflow).toMatch(/DISCORD_WEBHOOK_URL: \$\{\{ secrets\.DISCORD_WEBHOOK_URL \}\}/);
  });

  // The regression guard. `curl` without `--fail` exits 0 on 4xx, so a dead
  // webhook reads as a delivered page and the `|| echo` fallback never runs.
  // Delivery must stay behind a status check, which means behind the script.
  it('never pages with a bare curl, whose exit code cannot see an HTTP 4xx', () => {
    expect(workflow).not.toMatch(/curl/);
    expect(workflow).not.toMatch(/jq /);
  });
});
