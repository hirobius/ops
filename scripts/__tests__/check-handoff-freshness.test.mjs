import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-handoff-freshness.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'handoff-freshness-'));
  cleanup.push(dir);
  return dir;
}

// Runs the gate in fixture mode against a scratch HANDOFF.md, so tests never
// touch the real docs/ai/HANDOFF.md (whose content drifts every session).
function run(markdown) {
  const dir = tmp();
  const fx = join(dir, 'HANDOFF.md');
  writeFileSync(fx, markdown, 'utf8');
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--fixture-mode', '--json'], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: fx },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, json: JSON.parse(stdout) };
}

const HEADER = '# HANDOFF\n\n_Last updated: 2026-07-13_\n\n';

describe('check-handoff-freshness', () => {
  it('flags a Now bullet contradicted by a newer Decisions entry (ops#210 case)', () => {
    const markdown =
      HEADER +
      '## Now\n\n' +
      '- **🔒 FEATURE FREEZE (2026-07-08, Adrian).** No net-new features.\n\n' +
      '## Decisions (dated, newest first)\n\n' +
      '- 2026-07-11 (evening, Adrian): **feature freeze LIFTED** — ship everything.\n';

    const { code, json } = run(markdown);
    expect(code).toBe(1);
    expect(json.violations).toHaveLength(1);
    expect(json.violations[0].nowDate).toBe('2026-07-08');
    expect(json.violations[0].decisionDate).toBe('2026-07-11');
    expect(json.violations[0].sharedWords).toEqual(expect.arrayContaining(['feature', 'freeze']));
  });

  it('does not flag when the Decisions entry is older than the Now bullet', () => {
    const markdown =
      HEADER +
      '## Now\n\n' +
      '- **🔒 FEATURE FREEZE (2026-07-08, Adrian).** No net-new features.\n\n' +
      '## Decisions (dated, newest first)\n\n' +
      '- 2026-07-01 (Adrian): **feature freeze** kicked off for revenue focus.\n';

    const { code, json } = run(markdown);
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });

  it('does not flag unrelated newer decisions (no shared topic words)', () => {
    const markdown =
      HEADER +
      '## Now\n\n' +
      '- **🔒 FEATURE FREEZE (2026-07-08, Adrian).** No net-new features.\n\n' +
      '## Decisions (dated, newest first)\n\n' +
      '- 2026-07-11 (Adrian): **Supabase migration 0010 applied** in prod.\n';

    const { code, json } = run(markdown);
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });

  it('skips Now bullets with no inline date (nothing to anchor against)', () => {
    const markdown =
      HEADER +
      '## Now\n\n' +
      '- **📥 Ralph parked inbox (ops#141, PR open).** Adds a Parked lane.\n\n' +
      '## Decisions (dated, newest first)\n\n' +
      '- 2026-07-11 (Adrian): **Ralph parked inbox REMOVED** per Adrian.\n';

    const { code, json } = run(markdown);
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });

  it('passes clean when there is no Decisions section at all', () => {
    const markdown =
      HEADER + '## Now\n\n- **🔒 FEATURE FREEZE (2026-07-08, Adrian).** No net-new features.\n';

    const { code, json } = run(markdown);
    expect(code).toBe(0);
    expect(json.violations).toHaveLength(0);
  });
});
