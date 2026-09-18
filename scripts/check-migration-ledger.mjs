#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Compares supabase/migrations/*.sql against the live supabase_migrations.schema_migrations ledger and reports every migration the repo has but the ledger does not (and every ledger row no repo migration explains). Skips loudly when Supabase credentials are absent — it never reports "in sync" for a ledger it could not read.
 *
 * Why this exists (ops#348): repo↔database was the only schema seam in this
 * repo with no gate. `check-schema-drift` covers site-engine↔ops and
 * `ops-drift.test.ts` covers site-engine↔snapshot, but nothing compared the
 * migration directory to what the database believes it has run. That gap let a
 * closed issue (#78) leave a missing table behind, and let a migration
 * *filename* be read as a table name for two days.
 *
 * What this gate can and cannot see:
 *   CAN  — which migrations the ledger has a row for.
 *   CANNOT — whether a migration's DDL actually ran.
 * So a finding here means "the ledger has no row for this", which is EITHER
 * never-applied OR applied-by-hand-and-unrecorded. The gate says exactly that
 * and refuses to guess. #348 was filed on precisely that kind of over-read.
 *
 * Reading the ledger needs the Management API, not the usual client:
 * `supabase_migrations` is not in PostgREST's exposed-schema list, so
 * `lib/supabase/server.mjs`'s service client cannot see it at all.
 *
 *   node scripts/check-migration-ledger.mjs
 *   node scripts/check-migration-ledger.mjs --json
 *   node scripts/check-migration-ledger.mjs --sql    # print the ledger-repair SQL
 *
 * Exit codes: 0 clean, or skipped for want of credentials · 1 drift found
 * (severity `warn` in the registry, so run-gates reports without blocking) ·
 * 2 invocation error in human mode.
 *
 * @module check-migration-ledger
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const LEDGER_TABLE = 'supabase_migrations.schema_migrations';

export const DEFAULT_PROJECT_REF = 'vvyccwxtcwvlusweenje';
export const ACCESS_TOKEN_FIX =
  'SUPABASE_ACCESS_TOKEN is not set — this gate reads the migration ledger through the ' +
  'Management API, which needs a personal access token. Create one at ' +
  'https://supabase.com/dashboard/account/tokens and set it in the environment ' +
  '(and in CI) to enable this check.';

/**
 * Ledger rows whose `version` cannot be derived from the filename.
 *
 * These are historical accidents, recorded here rather than papered over:
 *   - 2026-07-30: one bulk import row covers four separate repo migrations.
 *   - 0013 was renumbered from 0012 after the 2026-09-15 double-numbering
 *     collision, so the ledger kept the pre-rename label `0012_call_tracking`.
 *   - 0014 was pushed by the CLI and so carries a timestamp version.
 *
 * An alias asserts "this ledger row represents this migration". Add one only
 * after confirming the migration's objects exist in the database.
 */
export const LEDGER_ALIASES = {
  '0001_leads.sql': '20260730050748',
  '0002_lead_site_fields.sql': '20260730050748',
  '0005_lead_score.sql': '20260730050748',
  '0007_lead_lifecycle.sql': '20260730050748',
  '0013_call_tracking.sql': '20260915073433',
  '0014_drop_duplicate_call_columns.sql': '20260915165711',
};

const MIGRATION_RE = /^(\d{4})_([a-z0-9_]+)\.sql$/i;

/**
 * Parse `NNNN_snake_case.sql` filenames into `{ file, num, slug }`, sorted by
 * migration number. Anything that isn't a numbered .sql migration is ignored.
 *
 * @param {readonly string[]} filenames
 * @returns {{file: string, num: string, slug: string}[]}
 */
export function parseMigrationFiles(filenames) {
  return filenames
    .map((file) => {
      const m = MIGRATION_RE.exec(file);
      return m ? { file, num: m[1], slug: m[2] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.num.localeCompare(b.num));
}

function ledgerRowMatches(migration, row, aliases) {
  if (aliases[migration.file] && aliases[migration.file] === row.version) return true;
  if (row.version === migration.num) return true;
  const name = (row.name ?? '').trim().toLowerCase();
  return (
    name === `${migration.num}_${migration.slug}`.toLowerCase() ||
    name === migration.slug.toLowerCase()
  );
}

/**
 * Compare the repo's migrations against the ledger.
 *
 * @param {Object}   input
 * @param {{file:string,num:string,slug:string}[]} input.files
 * @param {{version:string,name?:string}[]}        input.ledgerRows
 * @param {Record<string,string>}                  [input.aliases]
 * @returns {{violations: object[], summary: object}}
 */
export function reconcile({ files, ledgerRows, aliases = LEDGER_ALIASES }) {
  const violations = [];
  const usedRows = new Set();

  for (const migration of files) {
    const match = ledgerRows.find((row) => ledgerRowMatches(migration, row, aliases));
    if (match) {
      usedRows.add(match);
      continue;
    }
    violations.push({
      file: `supabase/migrations/${migration.file}`,
      line: null,
      rule: 'migration-unrecorded',
      severity: 'warn',
      message:
        `${migration.file} has no row in ${LEDGER_TABLE}. This gate reads the ledger only, so ` +
        'it cannot distinguish "never applied" from "applied by hand and never recorded" — ' +
        "check whether this migration's objects exist before deciding which it is.",
      migration: migration.num,
    });
  }

  for (const row of ledgerRows) {
    if (usedRows.has(row)) continue;
    violations.push({
      file: '*',
      line: null,
      rule: 'ledger-orphan',
      severity: 'warn',
      message:
        `Ledger row ${row.version} (${row.name ?? 'unnamed'}) matches no migration in the repo. ` +
        'Either a migration file was deleted, or the row belongs to a repo migration under ' +
        'another name — in which case add it to LEDGER_ALIASES rather than deleting the row.',
      version: row.version,
    });
  }

  return {
    violations,
    summary: {
      migrations: files.length,
      ledgerRows: ledgerRows.length,
      matched: usedRows.size,
      unrecorded: violations.filter((v) => v.rule === 'migration-unrecorded').length,
      orphans: violations.filter((v) => v.rule === 'ledger-orphan').length,
    },
  };
}

/**
 * Render paste-ready ledger-repair SQL for the drift found. Writes only to the
 * ledger: it runs no DDL and re-applies no migration.
 *
 * @param {object[]} violations
 * @returns {string}
 */
export function buildRepairSql(violations) {
  const unrecorded = violations.filter((v) => v.rule === 'migration-unrecorded');
  const orphans = violations.filter((v) => v.rule === 'ledger-orphan');
  const out = [
    `-- Ledger repair for ${LEDGER_TABLE}`,
    '-- Generated by scripts/check-migration-ledger.mjs from the live ledger.',
    '--',
    '-- This writes ONLY to the ledger. It runs no DDL and re-applies no migration.',
    '-- A row here asserts "this migration is applied". Before running it, confirm',
    "-- each migration's objects actually exist — recording an unapplied migration",
    '-- hides it from every future check.',
    '',
  ];

  if (unrecorded.length > 0) {
    out.push(`insert into ${LEDGER_TABLE} (version, name)`, 'values');
    const values = unrecorded.map((v) => {
      const slug = v.file.replace(/^.*\/\d{4}_/, '').replace(/\.sql$/, '');
      return `  ('${v.migration}', '${slug}')`;
    });
    out.push(values.join(',\n'), 'on conflict (version) do nothing;', '');
  } else {
    out.push('-- Nothing to record: every repo migration already has a ledger row.', '');
  }

  if (orphans.length > 0) {
    out.push('-- Ledger rows with no matching repo migration. Left alone deliberately —');
    out.push('-- add a LEDGER_ALIASES entry if one of these IS a repo migration under');
    out.push('-- another name. Delete a row only if you are certain it is spurious.');
    for (const o of orphans) out.push(`--   ${o.version}`);
  }

  return `${out.join('\n')}\n`;
}

/**
 * Resolve the credentials this gate needs, without reading any .env file.
 *
 * @param {Record<string,string|undefined>} [env]
 * @returns {{ok: boolean, projectRef: string, missing: string[], message: string}}
 */
export function credentialState(env = process.env) {
  const token = env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = env.SUPABASE_PROJECT_REF?.trim() || DEFAULT_PROJECT_REF;
  if (!token)
    return { ok: false, projectRef, missing: ['SUPABASE_ACCESS_TOKEN'], message: ACCESS_TOKEN_FIX };
  return { ok: true, projectRef, missing: [], message: '' };
}

/**
 * Read the ledger through the Management API. PostgREST does not expose the
 * `supabase_migrations` schema, so the ordinary service client cannot do this.
 */
async function readLedger({ projectRef, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `select version, name from ${LEDGER_TABLE} order by version;` }),
  });
  if (!res.ok) {
    throw new Error(`Management API returned ${res.status} reading ${LEDGER_TABLE}`);
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error(`Unexpected ledger payload reading ${LEDGER_TABLE}`);
  return rows;
}

async function main(argv = process.argv) {
  const jsonMode = hasJsonFlag(argv);
  const sqlMode = argv.includes('--sql');

  const creds = credentialState(process.env);
  if (!creds.ok) {
    // Skip LOUDLY. Reporting "in sync" for a ledger we never read would be the
    // all-clear that check-sev1-visibility's rule exists to forbid.
    const skip = {
      file: '*',
      line: null,
      rule: 'ledger-unreadable',
      severity: 'info',
      message: `SKIPPED — ${creds.message}`,
    };
    if (jsonMode) emitResult({ violations: [skip], summary: { skipped: true }, ok: true }, true);
    else console.warn(`⚠ check-migration-ledger: ${skip.message}`);
    return 0;
  }

  const files = parseMigrationFiles(readdirSync(MIGRATIONS_DIR));

  let ledgerRows;
  try {
    ledgerRows = await readLedger({
      projectRef: creds.projectRef,
      token: process.env.SUPABASE_ACCESS_TOKEN,
    });
  } catch (err) {
    const failure = {
      file: '*',
      line: null,
      rule: 'ledger-unreadable',
      severity: 'warn',
      message: `Could not read ${LEDGER_TABLE}: ${err.message}. Result is UNKNOWN, not clean.`,
    };
    if (jsonMode)
      emitResult({ violations: [failure], summary: { skipped: true }, ok: false }, true);
    else console.error(`✗ check-migration-ledger — ${failure.message}`);
    return 1;
  }

  const { violations, summary } = reconcile({ files, ledgerRows });

  if (sqlMode && !jsonMode) {
    process.stdout.write(buildRepairSql(violations));
    return violations.length > 0 ? 1 : 0;
  }

  if (jsonMode) {
    emitResult({ violations, summary, ok: violations.length === 0 }, true);
    return violations.length > 0 ? 1 : 0;
  }

  if (violations.length === 0) {
    console.log(
      `✓ check-migration-ledger — ${summary.migrations} migration(s) all present in the ledger.`,
    );
    return 0;
  }

  console.error(`✗ check-migration-ledger — ${violations.length} ledger drift(s):`);
  for (const v of violations) console.error(`  [${v.rule}] ${v.message}`);
  console.error('');
  console.error(
    'Fix: run `node scripts/check-migration-ledger.mjs --sql` for paste-ready repair SQL.',
  );
  console.error(
    `     SQL editor: https://supabase.com/dashboard/project/${creds.projectRef}/sql/new`,
  );
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`check-migration-ledger: ${err.message}`);
      process.exit(2);
    });
}

export { main };
