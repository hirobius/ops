import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'hooks', 'blast-radius.mjs');

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
});

function tmpRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'blast-radius-'));
  cleanup.push(dir);
  return dir;
}

// Runs the hook exactly as Claude Code would: pipe the PreToolUse payload on
// stdin, read stdout. Returns null when the hook emits nothing.
function runHook(root, filePath, input = 'not json') {
  const payload = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
  });
  const stdout = execFileSync('node', [SCRIPT], {
    input: input === 'not json' ? payload : input,
    env: { ...process.env, BLAST_RADIUS_ROOT: root },
    encoding: 'utf8',
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
}

describe('blast-radius PreToolUse hook', () => {
  it('names the direct caller/importer of a known exported symbol', () => {
    const root = tmpRoot();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'widget.mjs'),
      'export function renderWidget() { return 1; }\n',
    );
    writeFileSync(
      join(root, 'src', 'app.mjs'),
      "import { renderWidget } from './widget.mjs';\nrenderWidget();\n",
    );

    const result = runHook(root, join(root, 'src', 'widget.mjs'));

    expect(result).not.toBeNull();
    expect(result.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(result.hookSpecificOutput.additionalContext).toContain('app.mjs');
    // advisory only — must never carry a permissionDecision that could block the edit
    expect(result.hookSpecificOutput.permissionDecision).toBeUndefined();
  });

  it('produces no output when the file has no callers in-tree', () => {
    const root = tmpRoot();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'orphan.mjs'), 'export function unused() {}\n');

    expect(runHook(root, join(root, 'src', 'orphan.mjs'))).toBeNull();
  });

  it('is fail-soft: malformed stdin JSON never throws or blocks', () => {
    const root = tmpRoot();
    let code = 0;
    let stdout = '';
    try {
      stdout = execFileSync('node', [SCRIPT], {
        input: 'not valid json {{{',
        env: { ...process.env, BLAST_RADIUS_ROOT: root },
        encoding: 'utf8',
      });
    } catch (err) {
      code = err.status ?? 1;
      stdout = err.stdout ?? '';
    }
    expect(code).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('respects BLAST_RADIUS_DISABLE and emits nothing', () => {
    const root = tmpRoot();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'widget.mjs'), 'export function renderWidget() {}\n');
    writeFileSync(
      join(root, 'src', 'app.mjs'),
      "import { renderWidget } from './widget.mjs';\nrenderWidget();\n",
    );

    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: join(root, 'src', 'widget.mjs') },
    });
    const stdout = execFileSync('node', [SCRIPT], {
      input: payload,
      env: { ...process.env, BLAST_RADIUS_ROOT: root, BLAST_RADIUS_DISABLE: '1' },
      encoding: 'utf8',
    });
    expect(stdout.trim()).toBe('');
  });
});
