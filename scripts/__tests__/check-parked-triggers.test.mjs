import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-parked-triggers.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

// Runs the gate in fixture mode against a scratch PARKED.md, so tests never
// depend on the real docs/ai/PARKED.md (whose dates fire as the calendar moves).
function run(markdown) {
  const dir = mkdtempSync(join(tmpdir(), 'parked-triggers-'));
  cleanup.push(dir);
  const fx = join(dir, 'PARKED.md');
  writeFileSync(fx, markdown, 'utf8');
  let stdout = '';
  let code = 0;
  try {
    stdout = execFileSync('node', [SCRIPT, '--fixture-mode'], {
      cwd: ROOT,
      env: { ...process.env, FIXTURE_FILE: fx },
      encoding: 'utf8',
    });
  } catch (err) {
    code = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  return { code, stdout };
}

const HEADER = '# PARKED\n\n**Next quarterly review: 2099-01-01.**\n\n';
const GENERIC = 'File a FRESH issue';

describe('check-parked-triggers', () => {
  it('reads $FIXTURE_FILE in fixture mode and names an entry whose date has passed', () => {
    const { code, stdout } = run(
      HEADER +
        '### Something long overdue\n\n' +
        '- **origin:** ops#002 (closed 2026-09-15)\n' +
        '- **trigger:** `date: 2020-01-01`\n',
    );
    expect(code).toBe(1);
    expect(stdout).toContain('Something long overdue');
  });

  it("prints a recurring entry's own `when it fires:` line instead of file-and-delete", () => {
    const { code, stdout } = run(
      HEADER +
        '### Betting table — next sitting\n\n' +
        '- **origin:** ops#319 (closed 2026-09-16)\n' +
        '- **trigger:** `date: 2020-01-01`\n' +
        '- **when it fires:** run the table, then roll this date forward 4 weeks. Do not file an issue for it.\n',
    );
    expect(code).toBe(1);
    expect(stdout).toContain('roll this date forward 4 weeks');
    expect(stdout).not.toContain(GENERIC);
  });

  it('still prints file-and-delete when a one-shot entry fires alongside a recurring one', () => {
    const { code, stdout } = run(
      HEADER +
        '### Betting table — next sitting\n\n' +
        '- **trigger:** `date: 2020-01-01`\n' +
        '- **when it fires:** roll this date forward 4 weeks.\n\n' +
        '### Ship tripwire\n\n' +
        '- **origin:** ops#321\n' +
        '- **trigger:** `date: 2020-01-01`\n',
    );
    expect(code).toBe(1);
    expect(stdout).toContain('roll this date forward 4 weeks');
    expect(stdout).toContain(GENERIC);
  });

  it('exits 0 when no trigger has fired', () => {
    const { code } = run(
      HEADER +
        '### Not yet\n\n' +
        '- **trigger:** `date: 2099-12-31`\n' +
        '- **when it fires:** roll this date forward 4 weeks.\n',
    );
    expect(code).toBe(0);
  });
});
