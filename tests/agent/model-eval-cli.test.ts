// @vitest-environment node
/**
 * tests/agent/model-eval-cli.test.ts — ops#7.
 *
 * The one command Adrian runs. Exercised as a real subprocess on every path that
 * spends nothing: the dry-run plan, the missing-key stop, and bad arguments.
 * The paid path is covered by model-eval-run.test.ts with stub stages.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/eval-agent-models.mjs');

function run(args: string[]) {
  const env = { ...process.env };
  // A developer shell with a real key must not turn a test into a billed run.
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('scripts/eval-agent-models.mjs', () => {
  it('--dry-run prints the plan and a rough cost without a key or any API call', () => {
    const r = run(['--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/8 leads/);
    expect(r.out).toMatch(/opus-4-8.*sonnet-5/);
    expect(r.out).toMatch(/generate: 48/); // 8 leads × 3 arms × 2 trials
    expect(r.out).toMatch(/rough/i);
    expect(r.out).toMatch(/no API calls/i);
  });

  it('stops before spending when no key is set, and says exactly how to fix it', () => {
    const r = run([]);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/ANTHROPIC_API_KEY/);
    expect(r.err).toMatch(/https:\/\/console\.anthropic\.com\/settings\/keys/);
    expect(r.err).toMatch(/node --env-file=\.env\.local scripts\/eval-agent-models\.mjs/);
  });

  it('rejects an unknown arm with the list of known ones', () => {
    const r = run(['--dry-run', '--arms', 'opus-4-8,gpt-9']);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/Unknown arm "gpt-9"/);
    expect(r.err).toMatch(/sonnet-5/);
  });

  it('reads leads from a file and reports the ones the pipeline would reject', () => {
    const dir = mkdtempSync(join(tmpdir(), 'model-eval-'));
    const file = join(dir, 'leads.json');
    writeFileSync(
      file,
      JSON.stringify([
        { name: 'Ok Lawn', city: 'Boise', region: 'ID' },
        { name: 'No Town', region: 'TX' },
      ]),
    );
    const r = run(['--dry-run', '--leads', file, '--arms', 'opus-4-8,sonnet-5', '--trials', '1']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1 leads/);
    expect(r.out).toMatch(/skipped 1.*No Town/s);
    expect(r.out).toMatch(/generate: 2/);
  });

  it('--help exits 0 with usage', () => {
    const r = run(['--help']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/--from-db/);
    expect(r.out).toMatch(/--max-usd/);
  });
});
