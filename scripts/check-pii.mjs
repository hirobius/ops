#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-pii.mjs
 *
 * Blocks personal data (client names, contact mailboxes, phone numbers,
 * private Google/Microsoft workspace links) from entering git (ops#27, ops#35).
 *
 * WHAT IT CHECKS (lib/pii/detect.mjs):
 *   error  denylist term         real client/contact identifiers, loaded from
 *                                the PII_DENYLIST env var (the Actions secret)
 *                                and/or the gitignored .pii-denylist file —
 *                                the list is PII itself, so never in the repo.
 *                                Also matched in decoded/loosened copies of the
 *                                text (percent/JSON/HTML escapes, accents,
 *                                slugs, camelCase, comment-wrapped lines)
 *   error  private workspace URL Google Docs/Drive/Chat/Mail/Admin, Outlook /
 *                                M365 admin / Azure portal, SharePoint, Wix editor
 *   error  denylist file         .pii-denylist or a copy of it (any file named
 *                                like pii-denylist, or a line that is an
 *                                entry's pattern text)
 *   warn   email address         outside the reviewed allowlist
 *   warn   US phone number       placeholders (555, repeated digits) skipped
 *
 * Why email/phone only warn: run-gates fails pre-commit on ANY non-zero exit,
 * whatever the registry severity says (ops#304), so a blocking rule must be
 * precise. The 2026-09-16 sweep measured non-allowlisted emails at ~11% real
 * PII and found phones mostly public business listings plus fixture numbers.
 * Denylist terms and private workspace URLs had ~0 false positives. The
 * client mailboxes that matter are denylist entries (@client-domain), so they
 * block anyway.
 *
 * MASKING: output names the rule, the location and the match LENGTH, never the
 * value — ops, portal-kit and site-engine are public, so CI logs are public. A
 * file path that itself matches the denylist is replaced by a hash everywhere
 * it would be printed.
 *
 * MODES (what is scanned):
 *   (default)              lines ADDED in the staged change + staged paths (pre-commit).
 *                          With nothing staged (the post-commit re-run, which
 *                          catches --no-verify commits): what HEAD adds against
 *                          every parent, + its message
 *   --message-file <file>  a commit message file (.husky/commit-msg via
 *                          scripts/pii-commit-msg.mjs)
 *   --range A..B           lines B adds since forking from A, + commit messages
 *   --github-event         the pull_request / push range from $GITHUB_EVENT_PATH,
 *                          + the pull request title, body and branch name
 *   --tree <dir>           every tracked text file in another checkout (weekly)
 *   --records <file.json>  [{ "location", "text" }] records (weekly issue text)
 *   --fixture-mode         FIXTURE_FILE={ denylist: [...], files: [{ path, text }] }
 *
 * Content git calls binary is still scanned: diffs run with --text (so a
 * `-diff`/`binary` attribute cannot hide a file), UTF-16 files are decoded
 * (lib/pii/decode.mjs), and a changed file that is neither is named in a
 * notice as not scanned.
 *
 * OPTIONS:
 *   --fail-on error|warn   lowest severity that fails the run (default: error)
 *   --label <text>         name for the scanned target in output
 *   --github               emit Actions annotations + a $GITHUB_STEP_SUMMARY section
 *   --json                 gate-output JSON on stdout (scripts/lib/gate-output.mjs)
 *
 * Exit codes: 0 no failing findings · 1 failing findings · 2 usage or git error.
 *
 * Handling a hit: docs/guardrails/pii-gate.md
 *
 * @module check-pii
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { decodeText } from '../lib/pii/decode.mjs';
import { detectPii } from '../lib/pii/detect.mjs';
import { DENYLIST_ENV, DENYLIST_FILE, loadDenylist, parseDenylist } from '../lib/pii/denylist.mjs';
import { addedInAll, addedLineBlocks } from '../lib/pii/diff.mjs';
import { commitMessageText, pullRequestEventText } from '../lib/pii/github-text.mjs';
import { EMPTY_TREE, parseRangeSpec, resolveEventRange } from '../lib/pii/range.mjs';
import {
  GUIDE,
  SECRETS_URL,
  formatFindingLine,
  isFailing,
  plainAnnotation,
  redactPath,
  summaryMarkdown,
  toAnnotation,
} from '../lib/pii/report.mjs';
import { emitResult } from './lib/gate-output.mjs';

// ── Arguments ────────────────────────────────────────────────────────────────

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = {
    json: false,
    github: false,
    fixture: false,
    failOn: 'error',
    label: null,
    range: null,
    githubEvent: false,
    tree: null,
    records: null,
    messageFile: null,
  };
  const takeValue = (i, flag) => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--'))
      throw new UsageError(`${flag} needs a value.`);
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--json':
        opts.json = true;
        break;
      case '--github':
        opts.github = true;
        break;
      case '--fixture-mode':
        opts.fixture = true;
        break;
      case '--github-event':
        opts.githubEvent = true;
        break;
      case '--fail-on':
        opts.failOn = takeValue(i++, arg);
        if (!['error', 'warn'].includes(opts.failOn)) {
          throw new UsageError('--fail-on must be "error" or "warn".');
        }
        break;
      case '--label':
        opts.label = takeValue(i++, arg);
        break;
      case '--range':
        opts.range = takeValue(i++, arg);
        break;
      case '--tree':
        opts.tree = takeValue(i++, arg);
        break;
      case '--records':
        opts.records = takeValue(i++, arg);
        break;
      case '--message-file':
        opts.messageFile = takeValue(i++, arg);
        break;
      default:
        throw new UsageError(
          `Unknown argument ${JSON.stringify(arg)}. See the header of scripts/check-pii.mjs.`,
        );
    }
  }
  if (process.env.HDS_FIXTURE_MODE === '1') opts.fixture = true;
  if (opts.json && opts.github) {
    throw new UsageError(
      '--json and --github cannot be combined: annotations would corrupt the JSON on stdout.',
    );
  }
  return opts;
}

// ── git ──────────────────────────────────────────────────────────────────────

/**
 * `--text` so a `.gitattributes` `-diff`/`binary` attribute cannot hide a text
 * file; `--full-index` so a file with NUL bytes can be re-read by blob id
 * (lib/pii/diff.mjs).
 */
const DIFF_FLAGS = [
  '-c',
  'core.quotepath=false',
  'diff',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--text',
  '--full-index',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '-U0',
];

/** Paths a change adds or edits: added, copied, modified, renamed, type-changed. */
const CHANGED_PATHS = ['--name-only', '-z', '--diff-filter=ACMRT'];

/**
 * Run git. The inherited environment is kept on purpose for staged/range
 * scans: inside a hook, GIT_INDEX_FILE may point at a temporary index
 * (`git commit -a`), and that index is exactly what must be scanned.
 */
function git(args, { cwd, env, buffer = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      env: env ?? process.env,
      encoding: buffer ? 'buffer' : 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = String(err.stderr ?? '')
      .trim()
      .split('\n')[0];
    const subcommand = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '-c');
    throw new UsageError(`git ${subcommand} failed: ${stderr || err.message}`);
  }
}

/** A git query whose failure just means "no": trimmed stdout, or null. */
function gitOrNull(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function splitNul(text) {
  return text.split('\0').filter(Boolean);
}

// ── Scan targets ─────────────────────────────────────────────────────────────
//
// A target is { label, units, paths, prefix?, warning?, skipped? }.
//   units    { path, text, firstLine, inRepoFile } — text to scan; `path` drives
//            the generic-pattern exemptions, `inRepoFile` allows file annotations
//   paths    file paths checked against the denylist themselves
//   prefix   another repo's label, prepended to every displayed location
//   skipped  changed binary files that could not be read as text

const MAX_TEXT_BYTES = 5 * 1024 * 1024;

/** A blob as text: null when it is binary (not UTF-8/UTF-16) or over 5 MB. */
function blobText(blob) {
  const size = Number(git(['cat-file', '-s', blob]).trim());
  if (!(size <= MAX_TEXT_BYTES)) return null;
  return decodeText(git(['cat-file', 'blob', blob], { buffer: true }));
}

/**
 * Scan units for what a diff adds. A file with NUL bytes (UTF-16, images,
 * archives) is re-read from its blobs: decoded text is compared line by line
 * against the old side(s); anything undecodable is reported as skipped.
 */
function contentUnits(addedFiles) {
  const units = [];
  const skipped = [];
  const unit = (path, block) => ({
    path,
    text: block.text,
    firstLine: block.firstLine,
    inRepoFile: true,
  });
  for (const file of addedFiles) {
    if (!file.binary) {
      units.push(...file.blocks.map((block) => unit(file.path, block)));
      continue;
    }
    const text = file.newBlob ? blobText(file.newBlob) : null;
    if (text === null) {
      skipped.push(file.path);
      continue;
    }
    const oldTexts = file.oldBlobs.map((blob) => (blob ? (blobText(blob) ?? '') : ''));
    units.push(...addedLineBlocks(text, oldTexts).map((block) => unit(file.path, block)));
  }
  return { units, skipped };
}

function commitMessageUnit(sha, body) {
  return {
    path: `commit ${sha.slice(0, 12)} message`,
    text: body,
    firstLine: 1,
    inRepoFile: false,
  };
}

/**
 * The staged change. While a merge is being concluded (MERGE_HEAD exists),
 * only what is new against BOTH parents is scanned: merging main into a branch
 * must not re-block on lines main already carried (ops main has known hits
 * until the ops#27 rewrite), while a conflict resolution is still checked.
 *
 * With nothing staged, this is the post-commit re-run (.husky/post-commit runs
 * the pre-commit channel after the commit, when the index equals HEAD), so the
 * commit that was just made is scanned instead — that is what makes a
 * `--no-verify` bypass show up in the firing log.
 */
function stagedTarget() {
  const againstHead = git([...DIFF_FLAGS, '--cached']);
  const mergeHead = gitOrNull(['rev-parse', '-q', '--verify', 'MERGE_HEAD^{commit}']);
  if (!mergeHead) {
    if (againstHead.trim() === '') return lastCommitTarget();
    return {
      label: 'staged changes',
      ...contentUnits(addedInAll([againstHead])),
      paths: splitNul(git(['diff', '--cached', ...CHANGED_PATHS])),
    };
  }
  const againstMergeHead = git([...DIFF_FLAGS, '--cached', mergeHead]);
  const theirPaths = new Set(splitNul(git(['diff', '--cached', ...CHANGED_PATHS, mergeHead])));
  return {
    label: 'staged merge (new against both parents)',
    ...contentUnits(addedInAll([againstHead, againstMergeHead])),
    paths: splitNul(git(['diff', '--cached', ...CHANGED_PATHS])).filter((p) => theirPaths.has(p)),
  };
}

/** HEAD: what it adds against every parent (a merge adds only its own edits), + its message. */
function lastCommitTarget() {
  const label = 'last commit (nothing staged)';
  const head = gitOrNull(['rev-parse', '-q', '--verify', 'HEAD^{commit}']);
  if (!head) return { label, units: [], paths: [] };
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(' ').slice(1);
  const bases = parents.length > 0 ? parents : [EMPTY_TREE];
  const content = contentUnits(addedInAll(bases.map((base) => git([...DIFF_FLAGS, base, head]))));
  const pathSets = bases.map((base) => splitNul(git(['diff', ...CHANGED_PATHS, base, head])));
  const paths = pathSets[0].filter((p) => pathSets.every((set) => set.includes(p)));
  const message = commitMessageUnit(head, git(['log', '-1', '--format=%B', head]));
  return { label, units: [...content.units, message], skipped: content.skipped, paths };
}

/**
 * What a commit range adds: its added lines, the paths it adds or changes, and
 * the message of every commit in it (commit messages are published with the
 * code and the 2026-09-16 sweep found PII in them).
 */
function rangeTarget(range, label, extraUnits = []) {
  const messages = git(['log', '--format=%H%x00%B%x1e', ...range.logArgs])
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.includes('\0'))
    .map((record) => {
      const [sha, body] = record.split('\0');
      return commitMessageUnit(sha, body);
    });
  const content = contentUnits(addedInAll([git([...DIFF_FLAGS, ...range.diffArgs])]));
  return {
    label,
    warning: range.warning,
    units: [...content.units, ...messages, ...extraUnits],
    skipped: content.skipped,
    paths: splitNul(git(['diff', ...CHANGED_PATHS, ...range.diffArgs])),
  };
}

function textUnits(records) {
  return records.map((r) => ({ path: r.location, text: r.text, firstLine: 1, inRepoFile: false }));
}

/**
 * The event's commit range, plus the pull request's own title, body and branch
 * name: the title becomes main's merge or squash commit message.
 */
function githubEventTarget() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const missing = ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH'].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new UsageError(
      `${missing.join(', ')} not set. --github-event runs as a GitHub Actions step, which provides them; locally use --range origin/main..HEAD.`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  } catch (err) {
    throw new UsageError(`cannot read the event payload: ${err.message}`);
  }
  let range;
  try {
    range = resolveEventRange({
      eventName,
      payload,
      commitExists: (sha) => gitOrNull(['cat-file', '-e', `${sha}^{commit}`]) !== null,
      hasParent: (sha) => gitOrNull(['rev-parse', '--verify', '--quiet', `${sha}^1`]) !== null,
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
  return rangeTarget(
    range,
    `${eventName} changes`,
    textUnits(pullRequestEventText(eventName, payload)),
  );
}

/** A commit message file, as git will store it (comments and the verbose diff removed). */
function messageFileTarget(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new UsageError(`cannot read commit message file ${file}: ${err.message}`);
  }
  const configured = gitOrNull(['config', '--get', 'core.commentChar']);
  const commentChar = configured && configured !== 'auto' ? configured : '#';
  return {
    label: 'commit message',
    units: textUnits([
      { location: 'commit message', text: commitMessageText(raw, { commentChar }) },
    ]),
    paths: [],
  };
}

/**
 * Every tracked text file in another checkout (the weekly scan of the
 * portal-kit and site-engine tips). UTF-16 files are decoded; binary files and
 * files over 5 MB are skipped. GIT_* is stripped so a hook's GIT_DIR can never
 * redirect `git -C <dir>` to a different repository.
 */
function treeTarget(dir, label) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
  const paths = splitNul(git(['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: dir, env }));
  const units = [];
  for (const path of paths) {
    let buf;
    try {
      buf = readFileSync(join(dir, path));
    } catch {
      continue; // listed but absent (sparse checkout, submodule dir)
    }
    const text = buf.length > MAX_TEXT_BYTES ? null : decodeText(buf);
    if (text === null) continue;
    units.push({ path, text, firstLine: 1, inRepoFile: false });
  }
  return { label, prefix: `${label}:`, units, paths };
}

/**
 * Text records, e.g. issue and PR bodies from scripts/pii-fetch-github-text.mjs.
 * Locations are generated labels, so there are no file paths to check.
 */
function recordsTarget(file, label) {
  let records;
  try {
    records = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UsageError(`cannot read records file ${file}: ${err.message}`);
  }
  const valid =
    Array.isArray(records) &&
    records.every((r) => r && typeof r.location === 'string' && typeof r.text === 'string');
  if (!valid) {
    throw new UsageError(
      'records file must be a JSON array of { "location": string, "text": string }.',
    );
  }
  return { label, units: textUnits(records), paths: [] };
}

/**
 * Fixture mode (validate-fixture-proof-of-firing): the denylist comes ONLY
 * from the fixture, never from PII_DENYLIST or .pii-denylist, so the proof is
 * deterministic and a developer's real list cannot change the verdict.
 */
function fixtureTarget() {
  const file = process.env.FIXTURE_FILE;
  if (!file) throw new UsageError('--fixture-mode requires FIXTURE_FILE.');
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new UsageError(`cannot read fixture ${file}: ${err.message}`);
  }
  const files = Array.isArray(fixture.files) ? fixture.files : [];
  return {
    denylist: {
      ...parseDenylist((fixture.denylist ?? []).join('\n'), { source: 'fixture' }),
      sources: ['fixture'],
    },
    target: {
      label: 'fixture',
      units: files.map((f) => ({ path: f.path, text: f.text, firstLine: 1, inRepoFile: false })),
      paths: files.map((f) => f.path),
    },
  };
}

// ── Scan ─────────────────────────────────────────────────────────────────────

/**
 * A file named like the denylist (`.pii-denylist~`, `pii-denylist.txt`, …).
 * The gate's own tests are the one reviewed exception.
 */
const DENYLIST_NAME = /pii[-_. ]?deny[-_. ]?list/i;
const DENYLIST_NAME_EXEMPT = /^scripts\/__tests__\/pii-[^/]*\.test\.mjs$/;

function isDenylistCopyName(path) {
  const normalized = path.replace(/\\/g, '/');
  return DENYLIST_NAME.test(normalized.split('/').pop()) && !DENYLIST_NAME_EXEMPT.test(normalized);
}

/**
 * How a location is printed. Any path or label that matches the denylist is
 * replaced by a hash — tested per path, so no route (a content finding, a
 * notice, a path git listed differently) can print it raw.
 */
function makeDisplay(target, denylist) {
  const hits = new Map();
  const denylistHits = (path) => {
    if (!hits.has(path)) {
      hits.set(
        path,
        detectPii(path, { path, denylist: denylist.entries }).filter((f) => f.rule === 'denylist'),
      );
    }
    return hits.get(path);
  };
  return {
    denylistHits,
    isRedacted: (path) => denylistHits(path).length > 0,
    show: (path) =>
      `${target.prefix ?? ''}${denylistHits(path).length > 0 ? redactPath(path) : path}`,
  };
}

function scan(target, denylist, display) {
  const findings = [];
  // The path goes last: a path hit carries the unredacted path and its own offsets.
  const pathFinding = (path, { rule, detail, severity, length = 0 }) =>
    findings.push({
      rule,
      detail,
      severity,
      length,
      path: display.show(path),
      line: null,
      column: null,
      inRepoFile: false,
    });

  const paths = [
    ...new Set([
      ...target.paths,
      ...target.units.filter((u) => u.inRepoFile).map((u) => u.path),
      ...(target.skipped ?? []),
    ]),
  ];
  for (const path of paths) {
    for (const hit of display.denylistHits(path)) {
      pathFinding(path, { ...hit, detail: `${hit.detail} in a file path` });
    }
  }
  for (const path of paths) {
    if (!isDenylistCopyName(path)) continue;
    pathFinding(path, {
      rule: 'denylist-file',
      detail: `the denylist or a copy of it is tracked or staged — it is PII itself and must stay out of git (git rm --cached <file>; ${DENYLIST_FILE} copies are gitignored as *pii-denylist*)`,
      severity: 'error',
    });
  }

  for (const unit of target.units) {
    const hits = detectPii(unit.text, {
      path: unit.path,
      denylist: denylist.entries,
      firstLine: unit.firstLine,
    });
    for (const f of hits) {
      findings.push({
        ...f,
        path: display.show(unit.path),
        inRepoFile: unit.inRepoFile && !display.isRedacted(unit.path),
      });
    }
  }

  return findings;
}

// ── Output ───────────────────────────────────────────────────────────────────

/**
 * Loud, actionable notices: a scan that silently skipped the denylist would
 * look exactly like a clean one (the fail-loud convention in CLAUDE.md).
 */
function collectNotices(target, denylist, display, { github }) {
  const notices = [];
  if (denylist.sources.length === 0) {
    notices.push({
      title: 'PII denylist',
      text: github
        ? `The ${DENYLIST_ENV} secret is not set for this run, so client names and contacts were NOT checked — only the generic patterns (emails, phones, private workspace URLs). Add it at ${SECRETS_URL} with \`gh secret set ${DENYLIST_ENV} --repo hirobius/ops < <local denylist file>\`. Pull requests from forks never receive secrets; that case is expected.`
        : `No denylist loaded (${DENYLIST_ENV} unset, ${DENYLIST_FILE} absent), so client names were NOT checked — only the generic patterns. Create ${DENYLIST_FILE} at the repo root: ${GUIDE}.`,
    });
  }
  if (denylist.invalid.length > 0) {
    const where = denylist.invalid
      .map((i) => `${i.source} line ${i.index} (${i.reason})`)
      .join('; ');
    notices.push({
      title: 'PII denylist',
      text: `Skipped invalid denylist entries: ${where}. Fix those lines — they are not being checked.`,
    });
  }
  const skipped = target.skipped ?? [];
  if (skipped.length > 0) {
    const shown = skipped.slice(0, 20).map((p) => display.show(p));
    const more = skipped.length > shown.length ? ` and ${skipped.length - shown.length} more` : '';
    const count =
      skipped.length === 1 ? '1 binary file was' : `${skipped.length} binary files were`;
    notices.push({
      title: 'PII scan: binary files not scanned',
      text: `${count} not scanned for personal data (not UTF-8/UTF-16 text, or over 5 MB): ${shown.join(', ')}${more}. Spreadsheets, documents, PDFs, archives and images can hold client data this gate cannot read — open each one and confirm it has none.`,
    });
  }
  if (target.warning) notices.push({ title: 'PII scan range', text: target.warning });
  return notices;
}

function report({ target, findings, notices, denylist, opts }) {
  const failing = findings.filter((f) => isFailing(f, opts.failOn));
  const label = opts.label ?? target.label;
  const log = opts.json
    ? (line) => process.stderr.write(`${line}\n`)
    : (line) => process.stdout.write(`${line}\n`);

  if (opts.github) {
    for (const notice of notices) {
      process.stdout.write(`${plainAnnotation('warning', notice.title, notice.text)}\n`);
    }
    for (const f of findings) {
      process.stdout.write(`${toAnnotation(f, { inRepoFile: f.inRepoFile && f.line != null })}\n`);
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        summaryMarkdown({
          label,
          findings,
          failOn: opts.failOn,
          notices: notices.map((n) => n.text),
        }),
      );
    }
  } else {
    for (const notice of notices) log(`ℹ check-pii — ${notice.text}`);
  }

  const sources = denylist.sources.length > 0 ? denylist.sources.join(' + ') : 'none';
  if (findings.length === 0) {
    log(
      `✓ check-pii — ${label}: no personal data found (denylist: ${sources}, ${denylist.entries.length} entries)`,
    );
  } else {
    log(`check-pii — ${label} (denylist: ${sources}, ${denylist.entries.length} entries):`);
    for (const f of findings) log(formatFindingLine(f));
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warns = findings.length - errors;
    const verdict = failing.length > 0 ? '✗ blocked' : '✓ not blocking';
    log(
      `${verdict} — ${errors} error(s), ${warns} warning(s), failing on ${opts.failOn}. Handling a hit: ${GUIDE}`,
    );
  }

  if (opts.json) {
    emitResult(
      {
        violations: findings.map((f) => ({
          file: f.path,
          line: f.line,
          rule: `pii-${f.rule}`,
          severity: f.severity,
          message: `${f.detail} (value redacted, ${f.length} chars)`,
        })),
        summary: {
          label,
          denylistSources: denylist.sources,
          denylistEntries: denylist.entries.length,
          failOn: opts.failOn,
        },
        ok: failing.length === 0,
      },
      true,
    );
  }

  return failing.length > 0 ? 1 : 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function readIfExists(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * The main checkout's root, so sessions in `.claude/worktrees/*` use the single
 * `.pii-denylist` kept there. null outside a git repository.
 */
function mainCheckoutRoot() {
  const common = gitOrNull(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  return common ? dirname(common) : null;
}

function selectTarget(opts) {
  const chosen = [
    opts.range,
    opts.githubEvent || null,
    opts.tree,
    opts.records,
    opts.messageFile,
  ].filter(Boolean);
  if (chosen.length > 1) {
    throw new UsageError('Pick one of --range, --github-event, --tree, --records, --message-file.');
  }
  if (opts.tree) return treeTarget(opts.tree, opts.label ?? basename(opts.tree));
  if (opts.records) return recordsTarget(opts.records, opts.label ?? basename(opts.records));
  if (opts.messageFile) return messageFileTarget(opts.messageFile);
  if (opts.githubEvent) return githubEventTarget();
  if (opts.range) {
    let range;
    try {
      range = parseRangeSpec(opts.range);
    } catch (err) {
      throw new UsageError(err.message);
    }
    return rangeTarget(range, `range ${opts.range}`);
  }
  return stagedTarget();
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    const { target, denylist } = opts.fixture
      ? fixtureTarget()
      : {
          target: selectTarget(opts),
          denylist: loadDenylist({
            env: process.env,
            roots: [process.cwd(), mainCheckoutRoot()].filter(Boolean),
            readFile: readIfExists,
          }),
        };
    const display = makeDisplay(target, denylist);
    const findings = scan(target, denylist, display);
    const notices = collectNotices(target, denylist, display, opts);
    return report({ target, findings, notices, denylist, opts });
  } catch (err) {
    if (err instanceof UsageError) {
      const msg = `check-pii: ${err.message}`;
      process.stderr.write(`${msg}\n`);
      if (opts?.github) {
        process.stdout.write(`${plainAnnotation('error', 'PII scan could not run', msg)}\n`);
      }
      return 2;
    }
    throw err;
  }
}

process.exit(main());
