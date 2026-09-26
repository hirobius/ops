#!/usr/bin/env node
/**
 * scripts/hooks/blast-radius.mjs
 *
 * Claude Code PreToolUse hook (matcher: "Edit|Write"). Before an edit lands,
 * greps src/, scripts/, api/, lib/ for direct callers/importers of the file
 * about to be touched (by import path and by its exported symbol names) and
 * surfaces that list to the agent as advisory context, so the edit lands with
 * knowledge of who depends on the code. Prototype for issue #5 ("Blast
 * Radius" — The Code 2026-07-01).
 *
 * Read-only and advisory ONLY: it never sets `permissionDecision`, so the
 * tool call always proceeds, and any internal error is swallowed (exit 0,
 * no output) rather than surfaced — a broken hook must never break a
 * session. Wired in `.claude/settings.json` under `hooks.PreToolUse`; remove
 * that entry, or set `BLAST_RADIUS_DISABLE=1` in the environment, to disable.
 *
 * Contract: reads the Claude Code PreToolUse JSON payload from stdin
 * (`tool_input.file_path`), and on a hit, writes
 * `{ hookSpecificOutput: { hookEventName, additionalContext } }` to stdout.
 * `BLAST_RADIUS_ROOT` overrides the search root (used by the self-test).
 *
 * Self-test: pnpm test scripts/__tests__/blast-radius.test.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, basename, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.BLAST_RADIUS_ROOT || join(__dirname, '..', '..');

const SEARCH_DIRS = ['src', 'scripts', 'api', 'lib'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const MAX_FILES = 4000; // safety cap so a pathological tree can't hang the hook
const MAX_CALLERS = 12;

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    if (out.length >= MAX_FILES) return out;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(name)) && !name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

// Exported top-level declarations — the symbols worth tracing callers for.
function extractSymbols(source) {
  const names = new Set();
  const declRe =
    /\bexport\s+(?:default\s+)?(?:async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = declRe.exec(source)) !== null) names.add(m[1]);
  return [...names];
}

function importsFile(source, targetBase) {
  const esc = targetBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\bfrom\\s+['"][^'"]*\\b${esc}(\\.[cm]?[jt]sx?)?['"]|\\brequire\\(\\s*['"][^'"]*\\b${esc}(\\.[cm]?[jt]sx?)?['"]\\s*\\)`,
  );
  return re.test(source);
}

function findCallers(files, editedFile, symbols) {
  const editedBase = basename(editedFile).replace(/\.[cm]?[jt]sx?$/, '');
  const callers = [];
  for (const f of files) {
    if (f === editedFile) continue;
    let source;
    try {
      source = readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const hit =
      importsFile(source, editedBase) || symbols.some((s) => new RegExp(`\\b${s}\\b`).test(source));
    if (hit) {
      callers.push(relative(ROOT, f));
      if (callers.length >= MAX_CALLERS) break;
    }
  }
  return callers;
}

export function traceBlastRadius(filePath) {
  if (!filePath || !existsSync(filePath) || !EXTS.has(extname(filePath))) return null;

  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const files = SEARCH_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const symbols = extractSymbols(source).slice(0, 8);
  const callers = findCallers(files, filePath, symbols);

  return { file: relative(ROOT, filePath), symbols, callers };
}

function formatContext(result) {
  if (!result || result.callers.length === 0) return null;
  const lines = [
    `blast-radius: ${result.file} has ${result.callers.length} direct caller(s)/importer(s) in-tree — review before editing:`,
    ...result.callers.map((c) => `  - ${c}`),
  ];
  if (result.symbols.length) lines.push(`  exported symbols traced: ${result.symbols.join(', ')}`);
  return lines.join('\n');
}

function main() {
  if (process.env.BLAST_RADIUS_DISABLE === '1') return;

  const raw = readStdin();
  if (!raw) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const filePath = payload?.tool_input?.file_path;
  if (!filePath || typeof filePath !== 'string') return;

  const absPath = isAbsolute(filePath) ? filePath : join(ROOT, filePath);
  const context = formatContext(traceBlastRadius(absPath));
  if (context) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context },
      }) + '\n',
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch {
    // fail-soft: a broken hook must never block the tool call or the session
  }
  process.exit(0);
}
