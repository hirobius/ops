import { describe, it, expect } from 'vitest';

import {
  parseMigrationFiles,
  reconcile,
  buildRepairSql,
  credentialState,
  LEDGER_ALIASES,
} from '../check-migration-ledger.mjs';

// The ledger as documented on ops#348, verified against vvyccwxtcwvlusweenje
// on 2026-09-16. Deliberately messy: three different version conventions.
const REAL_LEDGER = [
  { version: '0009', name: 'view_security_invoker' },
  { version: '20260730050748', name: 'leads_schema_0001_0002_0005_0007' },
  { version: '20260915073433', name: '0012_call_tracking' },
  { version: '20260915165711', name: '0014_drop_duplicate_call_columns' },
];

const ALL_FILES = [
  '0001_leads.sql',
  '0002_lead_site_fields.sql',
  '0003_tasks.sql',
  '0004_tasks_dispatch_url.sql',
  '0005_lead_score.sql',
  '0006_site_quality.sql',
  '0007_lead_lifecycle.sql',
  '0008_task_dispatch.sql',
  '0009_view_security_invoker.sql',
  '0010_task_source_url.sql',
  '0011_digest_items.sql',
  '0012_pitch_queue.sql',
  '0013_call_tracking.sql',
  '0014_drop_duplicate_call_columns.sql',
];

describe('parseMigrationFiles', () => {
  it('splits NNNN_snake_case.sql into number and slug', () => {
    const [first] = parseMigrationFiles(['0011_digest_items.sql']);
    expect(first).toMatchObject({
      file: '0011_digest_items.sql',
      num: '0011',
      slug: 'digest_items',
    });
  });

  it('ignores anything that is not a numbered .sql migration', () => {
    const out = parseMigrationFiles(['README.md', 'seed.sql', '0003_tasks.sql', '.gitkeep']);
    expect(out.map((m) => m.file)).toEqual(['0003_tasks.sql']);
  });

  it('sorts by migration number regardless of input order', () => {
    const out = parseMigrationFiles(['0010_b.sql', '0002_a.sql', '0009_c.sql']);
    expect(out.map((m) => m.num)).toEqual(['0002', '0009', '0010']);
  });
});

describe('reconcile', () => {
  it('matches a ledger row whose version equals the migration number', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0009_view_security_invoker.sql']),
      ledgerRows: [{ version: '0009', name: 'view_security_invoker' }],
    });
    expect(violations).toEqual([]);
  });

  it('matches through the alias map when the ledger uses a timestamp version', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0013_call_tracking.sql']),
      ledgerRows: [{ version: '20260915073433', name: '0012_call_tracking' }],
      aliases: LEDGER_ALIASES,
    });
    expect(violations).toEqual([]);
  });

  it('does NOT match 0013 to that row without the alias — the version and name both disagree', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0013_call_tracking.sql']),
      ledgerRows: [{ version: '20260915073433', name: '0012_call_tracking' }],
      aliases: {},
    });
    expect(violations.map((v) => v.rule)).toContain('migration-unrecorded');
  });

  it('reports a repo migration with no ledger row', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0011_digest_items.sql']),
      ledgerRows: [],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      rule: 'migration-unrecorded',
      file: 'supabase/migrations/0011_digest_items.sql',
      severity: 'warn',
    });
  });

  it('cannot tell "never applied" from "applied but unrecorded", and says so', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0011_digest_items.sql']),
      ledgerRows: [],
    });
    // The ledger is the only thing this gate can see. Claiming the DDL never
    // ran would be an inference it has no evidence for — ops#348 was filed on
    // exactly that kind of over-read.
    expect(violations[0].message).toMatch(/either|cannot distinguish/i);
  });

  it('reports a ledger row that matches no repo migration', () => {
    const { violations } = reconcile({
      files: [],
      ledgerRows: [{ version: '20990101000000', name: 'applied_by_hand' }],
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: 'ledger-orphan', severity: 'warn' });
    expect(violations[0].message).toContain('applied_by_hand');
  });

  it('one bulk ledger row can satisfy several aliased migrations', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0001_leads.sql', '0002_lead_site_fields.sql']),
      ledgerRows: [{ version: '20260730050748', name: 'leads_schema_0001_0002_0005_0007' }],
      aliases: LEDGER_ALIASES,
    });
    expect(violations).toEqual([]);
  });

  it('on the real ops#348 ledger, flags exactly the migrations with no row', () => {
    const { violations, summary } = reconcile({
      files: parseMigrationFiles(ALL_FILES),
      ledgerRows: REAL_LEDGER,
      aliases: LEDGER_ALIASES,
    });
    const unrecorded = violations
      .filter((v) => v.rule === 'migration-unrecorded')
      .map((v) => v.file);
    // 0001/0002/0005/0007 are aliased to the bulk row; 0009 matches by version;
    // 0013/0014 are aliased. Everything else has no ledger row at all — which
    // is four MORE than ops#348's body claims (it named only 0010 and 0013).
    expect(unrecorded).toEqual([
      'supabase/migrations/0003_tasks.sql',
      'supabase/migrations/0004_tasks_dispatch_url.sql',
      'supabase/migrations/0006_site_quality.sql',
      'supabase/migrations/0008_task_dispatch.sql',
      'supabase/migrations/0010_task_source_url.sql',
      'supabase/migrations/0011_digest_items.sql',
      'supabase/migrations/0012_pitch_queue.sql',
    ]);
    expect(summary.orphans).toBe(0);
  });
});

describe('buildRepairSql', () => {
  it('emits one idempotent insert per unrecorded migration', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0010_task_source_url.sql', '0011_digest_items.sql']),
      ledgerRows: [],
    });
    const sql = buildRepairSql(violations);
    expect(sql).toContain("('0010', 'task_source_url')");
    expect(sql).toContain("('0011', 'digest_items')");
    expect(sql).toContain('on conflict');
  });

  it('never emits DDL — a ledger repair must not re-run a migration', () => {
    const { violations } = reconcile({
      files: parseMigrationFiles(['0011_digest_items.sql']),
      ledgerRows: [],
    });
    const sql = buildRepairSql(violations);
    expect(sql).not.toMatch(/\bcreate table\b|\bdrop\b|\balter table\b/i);
  });

  it('returns no insert statement when there is nothing to repair', () => {
    expect(buildRepairSql([])).not.toContain('insert into');
  });

  it('describes orphans as comments rather than deleting ledger rows', () => {
    const { violations } = reconcile({
      files: [],
      ledgerRows: [{ version: '20990101000000', name: 'applied_by_hand' }],
    });
    const sql = buildRepairSql(violations);
    expect(sql).not.toContain('delete from');
    expect(sql).toContain('-- ');
  });
});

describe('credentialState', () => {
  it('is ok when both the project ref and access token are present', () => {
    const state = credentialState({ SUPABASE_ACCESS_TOKEN: 't', SUPABASE_PROJECT_REF: 'r' });
    expect(state.ok).toBe(true);
  });

  it('falls back to the known project ref when only the token is set', () => {
    const state = credentialState({ SUPABASE_ACCESS_TOKEN: 't' });
    expect(state.ok).toBe(true);
    expect(state.projectRef).toBe('vvyccwxtcwvlusweenje');
  });

  it('names the missing variable and where to get it', () => {
    const state = credentialState({});
    expect(state.ok).toBe(false);
    expect(state.message).toContain('SUPABASE_ACCESS_TOKEN');
    expect(state.message).toMatch(/https:\/\/supabase\.com\//);
  });
});
