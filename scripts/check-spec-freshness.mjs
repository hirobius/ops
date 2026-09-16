#!/usr/bin/env node
/**
 * scripts/check-spec-freshness.mjs
 *
 * Anti-rot gate for `docs/specs/<epic-slug>.md` (ops#294, decided in the
 * ops#274 frontier-engineering session — `docs/ai/FRONTIER-DOCTRINE.md` §2,
 * anti-rot rule 4). The doctrine's known failure mode is documents outliving
 * their truth; specs carry `Status:` / `Last verified:` headers on that
 * promise, but nothing checked the promise was kept. This does:
 *
 *   - Every non-exempt spec must have a parseable `Status:` (one of
 *     draft/active/shipped/abandoned) and `Last verified: YYYY-MM-DD` header.
 *   - An `active` spec with `Last verified` older than 60 days is flagged.
 *   - An `active` spec whose referenced issues are ALL closed is flagged
 *     ("should be shipped").
 *   - Issue numbers referenced (the header `Issues:` line + the `## Tasks`
 *     table) must exist in the stated repo (default: GITHUB_REPO or
 *     hirobius/ops).
 *   - A `shipped` or `abandoned` spec is exempt from every other check —
 *     it's history, not instruction (doctrine §2 rule 5).
 *
 * Advisory only (registry severity: warn) — a stale spec is a signal to a
 * human, never a merge blocker.
 *
 * Network required for the issue-existence/closed checks (GitHub REST API) —
 * manual channel only, same as metric-north-star-share.mjs. `fetchIssueStates`
 * takes an injectable `fetchImpl` so its logic is testable without network.
 *
 * Usage:
 *   node scripts/check-spec-freshness.mjs
 *   node scripts/check-spec-freshness.mjs --json
 *   node scripts/check-spec-freshness.mjs --fixture-mode   (reads $FIXTURE_FILE,
 *     issue states from $FIXTURE_ISSUE_STATES as JSON, e.g. '{"185":"closed"}')
 *
 * Env: GITHUB_TOKEN (Issues: read). GITHUB_REPO defaults to hirobius/ops.
 *
 * Exit codes: 0 clean · 1 findings (or missing-token/fetch-error in --json
 * mode, per the audit-gates-supportjson contract) · 2 invocation error
 * (missing token or a GitHub fetch failure, non-json mode).
 *
 * @module check-spec-freshness
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';
import { authHint } from '../lib/github/issues.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPECS_DIR = join(ROOT, 'docs', 'specs');

export const SPEC_STATUSES = ['draft', 'active', 'shipped', 'abandoned'];
export const STALE_DAYS = 60;

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';
const TOKEN_FIX =
  'GITHUB_TOKEN is not set (needs "Issues: read"). Set it in your shell for a local run, ' +
  `or in Vercel → Settings → Environment Variables (Production) at ${VERCEL_ENV_URL} and ` +
  `redeploy. Fine-grained tokens: ${GITHUB_TOKEN_URL}.`;

// ── Pure parsing ──────────────────────────────────────────────────────────────

/** Everything before the first `## ` heading — where the header fields live. */
function headerBlock(markdown) {
  const m = /\n##\s/.exec(markdown);
  return m ? markdown.slice(0, m.index) : markdown;
}

/** The body of a `## <heading>` markdown section, or '' if absent. */
function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((l) => l.trim().startsWith(`## ${heading}`));
  if (startIdx === -1) return '';
  let end = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, end).join('\n');
}

/**
 * Parses the `Status:` and `Last verified:` header lines. `status` is the
 * lowercased value ONLY when it's one of SPEC_STATUSES; `lastVerified` is the
 * raw string ONLY when it's a valid `YYYY-MM-DD` date — otherwise both are
 * null, so an unparseable header reads the same as a missing one.
 * @param {string} markdown
 */
export function parseSpecHeader(markdown) {
  const block = headerBlock(markdown);

  const statusMatch = /^Status:\s*(\S+)/m.exec(block);
  const statusRaw = statusMatch ? statusMatch[1] : null;
  const statusLower = statusRaw ? statusRaw.toLowerCase() : null;
  const status = statusLower && SPEC_STATUSES.includes(statusLower) ? statusLower : null;

  const lvMatch = /^Last verified:\s*(\S+)/m.exec(block);
  const lastVerifiedRaw = lvMatch ? lvMatch[1] : null;
  const lastVerified =
    lastVerifiedRaw &&
    /^\d{4}-\d{2}-\d{2}$/.test(lastVerifiedRaw) &&
    !Number.isNaN(Date.parse(`${lastVerifiedRaw}T00:00:00Z`))
      ? lastVerifiedRaw
      : null;

  return { status, statusRaw, lastVerified, lastVerifiedRaw };
}

/**
 * Unique, sorted issue numbers referenced in the header `Issues:` line and
 * the `## Tasks` table — the single-file spec's stand-in for `tasks.md`.
 * @param {string} markdown
 * @returns {number[]}
 */
export function extractIssueNumbers(markdown) {
  const block = headerBlock(markdown);
  const issuesLineMatch = /^Issues:\s*(.+)$/m.exec(block);
  const tasksSection = extractSection(markdown, 'Tasks');
  const text = `${issuesLineMatch ? issuesLineMatch[1] : ''}\n${tasksSection}`;
  const numbers = [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/** Whole days between `dateStr` (YYYY-MM-DD, UTC midnight) and `now` (epoch ms). */
function daysSince(dateStr, now) {
  return (now - Date.parse(`${dateStr}T00:00:00Z`)) / 86_400_000;
}

/**
 * Every rot violation for one spec file. `issueState` maps issue number →
 * `'open' | 'closed'`; a number absent from the map is treated as not
 * existing in the stated repo.
 * @param {{ file: string, markdown: string, now: number, issueState?: Map<number, 'open'|'closed'> }} input
 */
export function evaluateSpec({ file, markdown, now, issueState = new Map() }) {
  const violations = [];
  const { status, lastVerified } = parseSpecHeader(markdown);

  if (!status) {
    violations.push({
      file,
      line: null,
      rule: 'SPEC_MISSING_STATUS_HEADER',
      severity: 'warn',
      message: `${file}: no parseable "Status:" header (expected one of ${SPEC_STATUSES.join('/')})`,
    });
  }

  // Doctrine §2 rule 5: a shipped/abandoned spec is history, not
  // instruction — never flagged, even if its other fields look stale.
  if (status === 'shipped' || status === 'abandoned') {
    return violations;
  }

  if (!lastVerified) {
    violations.push({
      file,
      line: null,
      rule: 'SPEC_MISSING_LAST_VERIFIED_HEADER',
      severity: 'warn',
      message: `${file}: no parseable "Last verified: YYYY-MM-DD" header`,
    });
  }

  const numbers = extractIssueNumbers(markdown);
  const unknown = numbers.filter((n) => !issueState.has(n));
  for (const n of unknown) {
    violations.push({
      file,
      line: null,
      rule: 'SPEC_UNKNOWN_ISSUE_REF',
      severity: 'warn',
      message: `${file}: references #${n}, which does not exist in the stated repo`,
    });
  }

  if (status === 'active') {
    if (lastVerified) {
      const age = daysSince(lastVerified, now);
      if (age > STALE_DAYS) {
        violations.push({
          file,
          line: null,
          rule: 'SPEC_STALE_LAST_VERIFIED',
          severity: 'warn',
          message: `${file}: Last verified ${lastVerified} is ${Math.floor(age)} days old (>${STALE_DAYS}) — reverify or mark shipped/abandoned`,
        });
      }
    }

    const known = numbers.filter((n) => issueState.has(n));
    if (
      known.length &&
      unknown.length === 0 &&
      known.every((n) => issueState.get(n) === 'closed')
    ) {
      violations.push({
        file,
        line: null,
        rule: 'SPEC_SHOULD_BE_SHIPPED',
        severity: 'warn',
        message: `${file}: status is active but every referenced issue (${known.map((n) => `#${n}`).join(', ')}) is closed — should be "shipped"`,
      });
    }
  }

  return violations;
}

/** `docs/specs/*.md`, excluding README.md and `_`-prefixed files (the template). */
export function listSpecFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md' && !f.startsWith('_'))
    .sort()
    .map((f) => join(dir, f));
}

// ── GitHub fetch (network) ───────────────────────────────────────────────────

const GH_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hirobius-ops',
});

/**
 * Fetches `state` ('open'|'closed') for each issue number, one request per
 * issue. A 404 means the issue doesn't exist — it's simply left out of the
 * returned map rather than erroring, so the caller reports it as its own
 * violation. `fetchImpl` is injectable so this is testable without network.
 * @param {{ repo: string, numbers: number[], token: string, fetchImpl?: typeof fetch }} input
 * @returns {Promise<Map<number, 'open'|'closed'>>}
 */
export async function fetchIssueStates({ repo, numbers, token, fetchImpl = fetch }) {
  const map = new Map();
  await Promise.all(
    numbers.map(async (n) => {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${n}`, {
        headers: GH_HEADERS(token),
        signal: AbortSignal.timeout(9000),
      });
      if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
      if (res.status === 404) return;
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `HTTP ${res.status} fetching issue #${n}${text ? ` — ${text.slice(0, 200)}` : ''}`,
        );
      }
      const body = await res.json();
      map.set(n, body.state);
    }),
  );
  return map;
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = hasJsonFlag(argv);
  const fixtureMode = argv.includes('--fixture-mode');
  const repo = process.env.GITHUB_REPO || 'hirobius/ops';
  const now = Date.now();

  let specs;
  if (fixtureMode) {
    const fixtureFile = process.env.FIXTURE_FILE;
    if (!fixtureFile || !existsSync(fixtureFile)) {
      console.error(
        'check-spec-freshness: --fixture-mode requires FIXTURE_FILE to point at a spec file.',
      );
      process.exit(2);
      return;
    }
    specs = [{ file: basename(fixtureFile), markdown: readFileSync(fixtureFile, 'utf8') }];
  } else {
    if (!existsSync(SPECS_DIR)) {
      if (jsonMode) emitResult({ violations: [] }, true);
      else console.log('check-spec-freshness: docs/specs/ absent — nothing to check.');
      process.exit(0);
      return;
    }
    specs = listSpecFiles(SPECS_DIR).map((f) => ({
      file: relative(ROOT, f),
      markdown: readFileSync(f, 'utf8'),
    }));
  }

  const numbers = [...new Set(specs.flatMap((s) => extractIssueNumbers(s.markdown)))];

  let issueState = new Map();
  if (numbers.length) {
    if (fixtureMode) {
      const raw = process.env.FIXTURE_ISSUE_STATES;
      if (raw)
        issueState = new Map(Object.entries(JSON.parse(raw)).map(([k, v]) => [Number(k), v]));
    } else {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        const violations = [
          {
            file: '*',
            line: null,
            rule: 'SPEC_FRESHNESS_MISSING_GITHUB_TOKEN',
            severity: 'warn',
            message: TOKEN_FIX,
          },
        ];
        if (jsonMode) {
          emitResult({ violations }, true);
          process.exit(1);
        } else {
          console.error(`check-spec-freshness: ${TOKEN_FIX}`);
          process.exit(2);
        }
        return;
      }
      try {
        issueState = await fetchIssueStates({ repo, numbers, token });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (jsonMode) {
          emitResult(
            {
              violations: [
                {
                  file: '*',
                  line: null,
                  rule: 'SPEC_FRESHNESS_GITHUB_ERROR',
                  severity: 'warn',
                  message,
                },
              ],
            },
            true,
          );
          process.exit(1);
        } else {
          console.error(`check-spec-freshness: ${message}`);
          process.exit(2);
        }
        return;
      }
    }
  }

  const violations = specs.flatMap((s) =>
    evaluateSpec({ file: s.file, markdown: s.markdown, now, issueState }),
  );

  if (jsonMode) {
    emitResult({ violations }, true);
    process.exit(violations.length ? 1 : 0);
    return;
  }

  if (!violations.length) {
    console.log(`✓ check-spec-freshness — ${specs.length} spec(s), no rot found.`);
    process.exit(0);
    return;
  }

  console.error(`✗ check-spec-freshness — ${violations.length} finding(s):\n`);
  for (const v of violations) console.error(`  [${v.rule}] ${v.message}`);
  process.exit(1);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
