#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/harvest-park-signals.mjs — read Ralph's park trail into learned-rules.jsonl (ops#298).
 *
 * `docs/ai/learned-rules.jsonl` went dark for four months because its
 * writer's only caller (`hermes-unit.mjs runPostMortem()`) was deleted with
 * the orchestration retirement. The park trail it needs never went away
 * though: `ralph/lib.sh` writes `ralph-attempt-failed` and the 🅿️ park
 * comment unconditionally on every failure, and an agent's own
 * `ralph-blocked:` stop is the third marker (`ralph/prompt.md` §1). This is
 * a reader over that trail, not a new writer with a new failure mode.
 *
 * The highest-value shape is a PAIR: what the loop thought broke (the park
 * or blocked reason) alongside what a human later said actually happened
 * (the next non-bot comment on the issue) — see ops#44's trail, where a
 * false park ("iteration ended without a pushed branch") was corrected by
 * adr-eng as a loop-infrastructure bug, not the issue's fault. Unresolved
 * parks (no human comment yet) carry nothing to learn from yet and are
 * skipped. `lib/ops/park-signals.mjs` does this parsing/pairing, pure and
 * unit-tested with no network; this script is the I/O shell around it.
 *
 * No distillation happens here — the raw pair is stored verbatim. Turning
 * it into an imperative rule is `scripts/promote-learned-rule.mjs`'s HITL
 * job by design (a stochastic LLM-distilled rule should never auto-write to
 * the gate set; the same caution applies to auto-distilling prose here).
 *
 * Discovery: GitHub's issue Search API (`in:comments`), one quoted-phrase
 * query per marker per fleet repo — cheap (9 calls) versus walking every
 * issue's full comment history. A comment invisible to search (rare —
 * indexing lag) is simply missed on that run; re-running later still finds
 * it, since this walks ALL issues (open + closed), not just open ones.
 *
 * Idempotent by construction, not by a stored dedupe key: `ts` on every
 * entry is the park/blocked comment's OWN `created_at` (not "now"), so the
 * `(evidence_unit_id, ts, rule)` triple is a stable fingerprint. Re-running
 * over the same GitHub history always derives the identical entry, so a
 * second run's fingerprints already exist and get skipped — see
 * `lib/ops/park-signals.mjs`'s `buildHarvestEntries` doc for why.
 *
 * `--dry-run` is the DEFAULT (house pattern: fleet-dispatch.mjs,
 * sync-preview-urls.mjs, reconcile-ralph-closures.mjs) — reports what it
 * would append and writes nothing. `--apply` persists. `--json` is
 * report-only (never writes, even with --apply) and always emits the
 * canonical `{ violations }` shape, INCLUDING on a missing/expired token —
 * see reconcile-ralph-closures.mjs's precedent: an unconfigured gate that
 * silently reports zero findings is how a guardrail goes quietly dead.
 *
 * Usage:
 *   node scripts/harvest-park-signals.mjs              # dry-run report
 *   node scripts/harvest-park-signals.mjs --apply       # persist new entries
 *   node scripts/harvest-park-signals.mjs --json        # canonical violations shape
 *   node scripts/harvest-park-signals.mjs --apply --max 10
 *
 * Env: GITHUB_TOKEN (Issues: read). Same three fleet repos api/tasks.ts's
 * FLEET_REPOS names (duplicated here rather than imported — that file is
 * TypeScript API-route code, this is a standalone script).
 *
 * Exit codes: 0 clean run (dry-run or apply) · 1 invocation/config error
 * (missing token, bad flag) · 2 a fleet-repo fetch failed outright.
 *
 * @module harvest-park-signals
 */

import { authHint } from '../lib/github/issues.mjs';
import {
  parseParkComments,
  pairWithRecovery,
  buildHarvestEntries,
} from '../lib/ops/park-signals.mjs';
import { persistLearnedRule, readLearnedRules } from './persist-learned-rule.mjs';

const FLEET_REPOS = ['hirobius/ops', 'hirobius/hds', 'hirobius/site-engine'];
const MARKERS = ['ralph-attempt-failed', 'Ralph parked this issue', 'ralph-blocked:'];
const DEFAULT_MAX = 50;
const SEARCH_MAX_PAGES = 3; // 3 × 100 = 300 matches per marker per repo, generous
const COMMENTS_MAX_PAGES = 5; // 500 comments per issue, generous

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const JSON_MODE = argv.includes('--json');
const HELP = argv.includes('--help') || argv.includes('-h');
const maxFlagIdx = argv.indexOf('--max');
const MAX =
  maxFlagIdx >= 0 && Number.isFinite(Number(argv[maxFlagIdx + 1]))
    ? Number(argv[maxFlagIdx + 1])
    : DEFAULT_MAX;

const TOKEN = process.env.GITHUB_TOKEN;
const TOKEN_FIX =
  'GITHUB_TOKEN is not set (needs "Issues: read"). Set it in your shell for a local run, ' +
  'or in Vercel → Settings → Environment Variables (Production) and redeploy: ' +
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables — ' +
  'fine-grained tokens: https://github.com/settings/personal-access-tokens';

function printHelp() {
  console.log(
    `scripts/harvest-park-signals.mjs — harvest Ralph's park trail into learned-rules.jsonl (ops#298)\n\n` +
      `Usage:\n` +
      `  node scripts/harvest-park-signals.mjs [--apply] [--json] [--max N]\n\n` +
      `--dry-run is the DEFAULT — reports what it would append, writes nothing.\n` +
      `--apply persists new entries to docs/ai/learned-rules.jsonl (capped at --max, default ${DEFAULT_MAX}).\n` +
      `--json is report-only (never writes) and always emits { violations }.\n`,
  );
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hirobius-ops',
  };
}

async function gh(url, token) {
  const res = await fetch(url, { headers: ghHeaders(token), signal: AbortSignal.timeout(9000) });
  if (res.status === 401 || res.status === 403) throw new Error(authHint(res.status));
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

/** Repo-local id `hirobius/ops` → `ops`, matching the existing corpus's evidence_unit_id convention. */
function shortRepoId(fullRepo) {
  return fullRepo.replace(/^hirobius\//, '');
}

/** Issue numbers (PRs excluded) across all states whose comments matched `marker`, via Search. */
async function searchIssueNumbers(repo, marker, token) {
  const numbers = new Set();
  for (let page = 1; page <= SEARCH_MAX_PAGES; page += 1) {
    const q = `repo:${repo} "${marker}" in:comments`;
    const data = await gh(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100&page=${page}`,
      token,
    );
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      if (!item.pull_request) numbers.add(item.number);
    }
    if (items.length < 100) break;
  }
  return numbers;
}

/** Full comment list for one issue, oldest first (the order GitHub returns them in). */
async function fetchAllComments(repo, issueNumber, token) {
  const out = [];
  for (let page = 1; page <= COMMENTS_MAX_PAGES; page += 1) {
    const batch = await gh(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      token,
    );
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

/** All harvestable entries for one fleet repo. */
async function harvestRepo(repo, token) {
  const numberSets = await Promise.all(MARKERS.map((m) => searchIssueNumbers(repo, m, token)));
  const numbers = [...new Set(numberSets.flatMap((s) => [...s]))].sort((a, b) => a - b);

  const entries = [];
  for (const n of numbers) {
    const comments = await fetchAllComments(repo, n, token);
    const signals = parseParkComments(comments);
    const paired = pairWithRecovery(signals, comments);
    entries.push(...buildHarvestEntries(`${shortRepoId(repo)}#${n}`, paired));
  }
  return { repo, issuesScanned: numbers.length, entries };
}

function fingerprint(entry) {
  return `${entry.evidence_unit_id}|${entry.ts}|${entry.rule}`;
}

async function main() {
  if (HELP) {
    printHelp();
    process.exit(0);
    return;
  }

  if (!TOKEN) {
    // --json must always emit the canonical { violations } shape (the
    // audit-gates-supportjson contract) — "I could not check" is a
    // violation, not silence, or an unconfigured gate goes quietly dead
    // exactly the way learned-rules.jsonl itself did (docs/ai/FRONTIER-DOCTRINE.md §4).
    if (JSON_MODE) {
      console.log(
        JSON.stringify(
          { violations: [{ id: 'missing-github-token', detail: TOKEN_FIX }], ok: false },
          null,
          2,
        ),
      );
      process.exit(1);
      return;
    }
    console.error(`harvest-park-signals: ${TOKEN_FIX}`);
    process.exit(1);
    return;
  }

  let results;
  try {
    results = await Promise.all(FLEET_REPOS.map((repo) => harvestRepo(repo, TOKEN)));
  } catch (err) {
    if (JSON_MODE) {
      console.log(
        JSON.stringify(
          { violations: [{ id: 'harvest-error', detail: err.message }], ok: false },
          null,
          2,
        ),
      );
      process.exit(1);
      return;
    }
    console.error(`harvest-park-signals: fleet scan failed — ${err.message}`);
    process.exit(2);
    return;
  }

  const allEntries = results.flatMap((r) => r.entries);
  const existing = readLearnedRules().filter((r) => r.source === 'park-harvest');
  const existingFingerprints = new Set(existing.map(fingerprint));
  const newEntries = allEntries.filter((e) => !existingFingerprints.has(fingerprint(e)));

  if (JSON_MODE) {
    const violations = newEntries.map((e) => ({
      id: `park-signal-${e.evidence_unit_id}-${e.ts}`,
      severity: 'info',
      detail: `${e.evidence_unit_id}: ${e.rule}`,
    }));
    console.log(
      JSON.stringify(
        {
          violations,
          summary: {
            reposScanned: results.length,
            issuesScanned: results.reduce((n, r) => n + r.issuesScanned, 0),
            newEntries: newEntries.length,
          },
          ok: true,
        },
        null,
        2,
      ),
    );
    process.exit(0);
    return;
  }

  console.log(
    `Scanned ${results.reduce((n, r) => n + r.issuesScanned, 0)} issue(s) across ${results.length} fleet repo(s).`,
  );
  console.log(
    `Found ${allEntries.length} park/blocked+recovery pair(s), ${newEntries.length} not yet in the corpus.`,
  );
  if (newEntries.length) {
    for (const e of newEntries) {
      console.log(`  [${e.evidence_unit_id}] ${e.rule}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry run — no writes. Pass --apply to persist to docs/ai/learned-rules.jsonl.');
    process.exit(0);
    return;
  }

  const toApply = newEntries.slice(0, MAX);
  let appended = 0;
  for (const entry of toApply) {
    if (persistLearnedRule(entry)) appended += 1;
  }
  console.log(
    `\nAppended ${appended}/${toApply.length} learned-rule entry(ies) (capped at --max ${MAX}).`,
  );
  process.exit(0);
}

main().catch((err) => {
  // Same contract as the missing-token path: every outcome — including "the
  // script itself crashed" — is the canonical { violations } shape in JSON mode.
  if (JSON_MODE) {
    console.log(
      JSON.stringify(
        { violations: [{ id: 'harvest-crash', detail: err.message }], ok: false },
        null,
        2,
      ),
    );
    process.exit(1);
    return;
  }
  console.error(err?.stack || String(err));
  process.exit(2);
});
