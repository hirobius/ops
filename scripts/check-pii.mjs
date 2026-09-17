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
 *                                the list is PII itself, so never in the repo
 *   error  private workspace URL Google Docs/Drive/Chat/Mail/Admin, Outlook /
 *                                M365 admin / Azure portal, SharePoint, Wix editor
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
 * file path that itself matches the denylist is replaced by a hash.
 *
 * MODES (what is scanned):
 *   (default)              lines ADDED in the staged change + staged paths (pre-commit)
 *   --range A..B           lines B adds since forking from A, + commit messages
 *   --github-event         the pull_request / push range from $GITHUB_EVENT_PATH
 *   --tree <dir>           every tracked text file in another checkout (weekly)
 *   --records <file.json>  [{ "location", "text" }] records (weekly issue text)
 *   --fixture-mode         FIXTURE_FILE={ denylist: [...], files: [{ path, text }] }
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
import { detectPii } from '../lib/pii/detect.mjs';
import { DENYLIST_ENV, DENYLIST_FILE, loadDenylist, parseDenylist } from '../lib/pii/denylist.mjs';
import { addedBlocks, addedInBoth } from '../lib/pii/diff.mjs';
import { parseRangeSpec, resolveEventRange } from '../lib/pii/range.mjs';
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

const DIFF_FLAGS = [
  '-c',
  'core.quotepath=false',
  'diff',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '-U0',
];

/**
 * Run git. The inherited environment is kept on purpose for staged/range
 * scans: inside a hook, GIT_INDEX_FILE may point at a temporary index
 * (`git commit -a`), and that index is exactly what must be scanned.
 */
function git(args, { cwd, env } = {}) {
  try {
    return execFileSync('git', args, {
      cwd,
      env: env ?? process.env,
      encoding: 'utf8',
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
// A target is { label, units, paths, prefix?, warning? }.
//   units  { path, text, firstLine, inRepoFile } — text to scan; `path` drives
//          the generic-pattern exemptions, `inRepoFile` allows file annotations
//   paths  file paths checked against the denylist themselves
//   prefix another repo's label, prepended to every displayed location

function fileUnits(addedFiles) {
  return addedFiles.flatMap((f) =>
    f.blocks.map((b) => ({ path: f.path, text: b.text, firstLine: b.firstLine, inRepoFile: true })),
  );
}

const stagedPaths = (...revs) =>
  splitNul(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR', ...revs]));

/**
 * The staged change. While a merge is being concluded (MERGE_HEAD exists),
 * only what is new against BOTH parents is scanned: merging main into a branch
 * must not re-block on lines main already carried (ops main has known hits
 * until the ops#27 rewrite), while a conflict resolution is still checked.
 */
function stagedTarget() {
  const againstHead = git([...DIFF_FLAGS, '--cached']);
  const mergeHead = gitOrNull(['rev-parse', '-q', '--verify', 'MERGE_HEAD^{commit}']);
  if (!mergeHead) {
    return {
      label: 'staged changes',
      units: fileUnits(addedBlocks(againstHead)),
      paths: stagedPaths(),
    };
  }
  const againstMergeHead = git([...DIFF_FLAGS, '--cached', mergeHead]);
  const theirPaths = new Set(stagedPaths(mergeHead));
  return {
    label: 'staged merge (new against both parents)',
    units: fileUnits(addedInBoth(againstHead, againstMergeHead)),
    paths: stagedPaths().filter((p) => theirPaths.has(p)),
  };
}

/**
 * What a commit range adds: its added lines, the paths it adds or changes, and
 * the message of every commit in it (commit messages are published with the
 * code and the 2026-09-16 sweep found PII in them).
 */
function rangeTarget(range, label) {
  const messages = git(['log', '--format=%H%x00%B%x1e', ...range.logArgs])
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record.includes('\0'))
    .map((record) => {
      const [sha, body] = record.split('\0');
      return {
        path: `commit ${sha.slice(0, 12)} message`,
        text: body,
        firstLine: 1,
        inRepoFile: false,
      };
    });
  return {
    label,
    warning: range.warning,
    units: [...fileUnits(addedBlocks(git([...DIFF_FLAGS, ...range.diffArgs]))), ...messages],
    paths: splitNul(git(['diff', '--name-only', '-z', '--diff-filter=ACMR', ...range.diffArgs])),
  };
}

function githubEventRange() {
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
  try {
    return resolveEventRange({
      eventName: process.env.GITHUB_EVENT_NAME,
      payload,
      commitExists: (sha) => gitOrNull(['cat-file', '-e', `${sha}^{commit}`]) !== null,
      hasParent: (sha) => gitOrNull(['rev-parse', '--verify', '--quiet', `${sha}^1`]) !== null,
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
}

const MAX_TREE_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Every tracked text file in another checkout (the weekly scan of the
 * portal-kit and site-engine tips). Binary files (a NUL in the first 8 KB) and
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
    if (buf.length > MAX_TREE_FILE_BYTES || buf.subarray(0, 8000).includes(0)) continue;
    units.push({ path, text: buf.toString('utf8'), firstLine: 1, inRepoFile: false });
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
  return {
    label,
    units: records.map((r) => ({
      path: r.location,
      text: r.text,
      firstLine: 1,
      inRepoFile: false,
    })),
    paths: [],
  };
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

function scan(target, denylist) {
  const findings = [];
  const redacted = new Map();
  const display = (path, prefix) => `${prefix ?? ''}${redacted.get(path) ?? path}`;

  for (const path of target.paths) {
    const pathHits = detectPii(path, { path, denylist: denylist.entries }).filter(
      (f) => f.rule === 'denylist',
    );
    if (pathHits.length === 0) continue;
    redacted.set(path, redactPath(path));
    for (const hit of pathHits) {
      findings.push({
        ...hit,
        detail: `${hit.detail} in a file path`,
        path: display(path, target.prefix),
        line: null,
        column: null,
        inRepoFile: false,
      });
    }
  }

  for (const path of target.paths) {
    if (path.split('/').pop() !== DENYLIST_FILE) continue;
    findings.push({
      rule: 'denylist-file',
      detail: `${DENYLIST_FILE} is tracked or staged — it is PII itself and must stay gitignored (git rm --cached ${DENYLIST_FILE})`,
      severity: 'error',
      path: display(path, target.prefix),
      line: null,
      column: null,
      length: 0,
      inRepoFile: false,
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
        path: display(unit.path, target.prefix),
        inRepoFile: unit.inRepoFile && !redacted.has(unit.path),
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
function collectNotices(target, denylist, { github }) {
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
  if (target.warning) notices.push({ title: 'PII scan range', text: target.warning });
  return notices;
}

function report({ target, findings, denylist, opts }) {
  const failing = findings.filter((f) => isFailing(f, opts.failOn));
  const notices = collectNotices(target, denylist, opts);
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
  const chosen = [opts.range, opts.githubEvent || null, opts.tree, opts.records].filter(Boolean);
  if (chosen.length > 1) {
    throw new UsageError('Pick one of --range, --github-event, --tree, --records.');
  }
  if (opts.tree) return treeTarget(opts.tree, opts.label ?? basename(opts.tree));
  if (opts.records) return recordsTarget(opts.records, opts.label ?? basename(opts.records));
  if (opts.githubEvent) {
    return rangeTarget(githubEventRange(), `${process.env.GITHUB_EVENT_NAME} changes`);
  }
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
    const findings = scan(target, denylist);
    return report({ target, findings, denylist, opts });
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
