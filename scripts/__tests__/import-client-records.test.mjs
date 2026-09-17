/**
 * Tests for scripts/import-client-records.mjs — the idempotent sync of the local,
 * gitignored clients/<slug>/ JSON into the private ClientStore: the bulk import,
 * the per-client write-through scripts call after editing a client folder, and
 * the drift report the dev server shows when the two disagree.
 *
 * Fixtures are written to a throwaway temp dir and are entirely synthetic
 * (client-alpha / client-beta, example.com, 555-0100). No network, no git.
 */

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readLocalClientRecords,
  planImport,
  importClientRecords,
  syncClientRecord,
  localDrift,
} from '../import-client-records.mjs';
import { createMemoryClientStore, ClientStoreError } from '../../lib/clients/store.mjs';

let root;

function writeJson(rel, value) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

const alphaMeta = {
  id: 'client-alpha',
  name: 'Jane Example Co',
  status: 'active',
  contact: { name: 'Jane Example', email: 'jane@example.com', phone: '555-0100' },
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-records-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// readLocalClientRecords
// ---------------------------------------------------------------------------

test('reads every known JSON file of a client folder into one record', () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  writeJson('client-alpha/tasks.json', { phases: [] });
  writeJson('client-alpha/checklist.json', { categories: [] });
  writeJson('client-alpha/retainer.json', { model: 'retainer' });
  writeJson('client-alpha/goals.json', { micro: [] });
  writeJson('client-alpha/status.json', { slug: 'client-alpha', status: 'active' });
  writeJson('client-alpha/automation-config.json', { mode: 'test' });
  writeJson('client-alpha/brand-audit.json', { summary: 'Synthetic audit.' });
  writeJson('client-alpha/automations/lead-intake/config.json', { id: 'lead-intake' });
  writeJson('client-alpha/automations/email-triage/config.json', { id: 'email-triage' });
  writeJson('client-alpha/automations/_log.jsonl', '{"not":"a workflow"}\n');
  writeJson('client-alpha/brand-audit-deck.md', '# not a record file');

  const { records, problems } = readLocalClientRecords(root);

  assert.deepEqual(problems, []);
  assert.deepEqual(records, [
    {
      slug: 'client-alpha',
      meta: alphaMeta,
      tasks: { phases: [] },
      checklist: { categories: [] },
      retainer: { model: 'retainer' },
      goals: { micro: [] },
      status: { slug: 'client-alpha', status: 'active' },
      automationConfig: { mode: 'test' },
      brandAudit: { summary: 'Synthetic audit.' },
      workflows: [
        { id: 'email-triage', config: { id: 'email-triage' } },
        { id: 'lead-intake', config: { id: 'lead-intake' } },
      ],
    },
  ]);
});

test('skips the _template scaffold and lists clients in slug order', () => {
  writeJson('_template/meta.json', { id: '<<slug>>' });
  writeJson('client-beta/meta.json', {
    id: 'client-beta',
    name: 'Example Prospect LLC',
    status: 'prospect',
  });
  writeJson('client-alpha/meta.json', alphaMeta);

  const { records, problems } = readLocalClientRecords(root);

  assert.deepEqual(problems, []);
  assert.deepEqual(
    records.map((r) => r.slug),
    ['client-alpha', 'client-beta'],
  );
});

test('reports — rather than silently importing — malformed JSON, a missing meta.json and a bad slug', () => {
  writeJson('client-alpha/meta.json', '{ not json');
  writeJson('client-beta/tasks.json', { phases: [] });
  writeJson('Client Gamma/meta.json', { id: 'x' });

  const { records, problems } = readLocalClientRecords(root);

  assert.deepEqual(records, []);
  assert.equal(problems.length, 3);
  assert.match(
    problems.find((p) => p.startsWith('client-alpha')),
    /meta\.json/,
  );
  assert.match(
    problems.find((p) => p.startsWith('client-beta')),
    /no meta\.json/,
  );
  assert.match(
    problems.find((p) => p.startsWith('Client Gamma')),
    /slug/,
  );
});

test('tolerates a UTF-8 byte-order mark (files saved by Windows PowerShell / Notepad)', () => {
  writeJson('client-alpha/meta.json', `\uFEFF${JSON.stringify(alphaMeta)}`);

  const { records, problems } = readLocalClientRecords(root);

  assert.deepEqual(problems, []);
  assert.deepEqual(records, [{ slug: 'client-alpha', meta: alphaMeta }]);
});

test('a missing source directory is a problem that names the expected layout', () => {
  const { records, problems } = readLocalClientRecords(path.join(root, 'nope'));
  assert.deepEqual(records, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /clients\/<slug>\/meta\.json/);
});

// ---------------------------------------------------------------------------
// planImport + importClientRecords
// ---------------------------------------------------------------------------

const alpha = { slug: 'client-alpha', meta: alphaMeta };
const beta = {
  slug: 'client-beta',
  meta: { id: 'client-beta', name: 'Example Prospect LLC', status: 'prospect' },
};

test('planImport sorts local records into create / update / unchanged, ignoring JSON key order', () => {
  const reordered = {
    slug: 'client-alpha',
    meta: {
      status: 'active',
      name: 'Jane Example Co',
      contact: alphaMeta.contact,
      id: 'client-alpha',
    },
  };
  const changedBeta = { ...beta, meta: { ...beta.meta, status: 'active' } };
  const plan = planImport(
    [reordered, changedBeta, { slug: 'client-gamma', meta: { id: 'client-gamma' } }],
    [alpha, beta],
  );

  assert.deepEqual(plan.unchanged, ['client-alpha']);
  assert.deepEqual(plan.update, ['client-beta']);
  assert.deepEqual(plan.create, ['client-gamma']);
});

test('dry run writes nothing', async () => {
  const store = createMemoryClientStore();
  const result = await importClientRecords({ store, records: [alpha, beta], apply: false });
  assert.deepEqual(result.plan.create, ['client-alpha', 'client-beta']);
  assert.equal(result.written, 0);
  assert.deepEqual(await store.list(), []);
});

test('apply imports once; a second run is a no-op (idempotent)', async () => {
  const store = createMemoryClientStore();

  const first = await importClientRecords({ store, records: [alpha, beta], apply: true });
  assert.equal(first.written, 2);
  assert.deepEqual(await store.list(), [alpha, beta]);

  const second = await importClientRecords({ store, records: [alpha, beta], apply: true });
  assert.equal(second.written, 0);
  assert.deepEqual(second.plan.unchanged, ['client-alpha', 'client-beta']);
});

test('apply never deletes a stored client that is absent locally', async () => {
  const store = createMemoryClientStore([beta]);
  await importClientRecords({ store, records: [alpha], apply: true });
  assert.deepEqual(
    (await store.list()).map((r) => r.slug),
    ['client-alpha', 'client-beta'],
  );
});

// ---------------------------------------------------------------------------
// syncClientRecord — write-through for scripts that edit clients/<slug>/
// ---------------------------------------------------------------------------

const newTasks = {
  phases: [
    {
      id: 'phase-1',
      name: 'Phase 1',
      status: 'in-progress',
      tasks: [{ id: 't-new', title: 'Synthetic routed task', status: 'todo' }],
    },
  ],
};

/** Wrap a store so a test can see whether upsert ran. */
function spyStore(store) {
  const calls = [];
  return {
    calls,
    list: () => store.list(),
    upsert: async (records) => {
      calls.push(records.map((r) => r.slug));
      return store.upsert(records);
    },
  };
}

const syncAlpha = (openStore) => syncClientRecord({ slug: 'client-alpha', dir: root, openStore });

test('syncClientRecord creates a client the store does not have yet', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  const store = createMemoryClientStore();

  const result = await syncAlpha(async () => store);

  assert.deepEqual(result, { ok: true, action: 'create' });
  assert.deepEqual(await store.list(), [alpha]);
});

test('syncClientRecord pushes a changed tasks.json (the auto-assigner write) and leaves other clients alone', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  writeJson('client-alpha/tasks.json', newTasks);
  const store = createMemoryClientStore([{ ...alpha, tasks: { phases: [] } }, beta]);

  const result = await syncAlpha(async () => store);

  assert.deepEqual(result, { ok: true, action: 'update' });
  const stored = await store.list();
  assert.deepEqual(stored.find((r) => r.slug === 'client-alpha')?.tasks, newTasks);
  assert.deepEqual(
    stored.find((r) => r.slug === 'client-beta'),
    beta,
  );
});

test('syncClientRecord does not write when the store already matches', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  const store = spyStore(createMemoryClientStore([alpha]));

  const result = await syncAlpha(async () => store);

  assert.deepEqual(result, { ok: true, action: 'unchanged' });
  assert.deepEqual(store.calls, []);
});

test('syncClientRecord reads only the named client — a broken sibling folder does not block it', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  writeJson('client-beta/meta.json', '{ not json');

  const result = await syncAlpha(async () => createMemoryClientStore());

  assert.deepEqual(result, { ok: true, action: 'create' });
});

test('syncClientRecord never throws on a broken record: nothing is written and the error names the fix', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  writeJson('client-alpha/tasks.json', '{ nope');
  const store = createMemoryClientStore();

  const result = await syncAlpha(async () => store);

  assert.equal(result.ok, false);
  assert.match(result.error, /tasks\.json is not valid JSON/);
  assert.match(result.error, /\/ops\/clients\/client-alpha/);
  assert.match(result.error, /import-client-records\.mjs --apply/);
  assert.deepEqual(await store.list(), []);
});

test('syncClientRecord reports a client folder that does not exist', async () => {
  const result = await syncAlpha(async () => createMemoryClientStore());
  assert.equal(result.ok, false);
  assert.match(result.error, /client-alpha: no meta\.json/);
});

test('syncClientRecord never throws when the store cannot be opened, and names the env fix', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);

  const result = await syncAlpha(async () => {
    throw new Error(
      'SUPABASE_MISSING_ENV: set a Supabase URL (SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY',
    );
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(result.error, /\.env\.local/);
  assert.match(result.error, /import-client-records\.mjs --apply/);
});

test('syncClientRecord never throws when the store fails (e.g. migration not applied)', async () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  const failing = {
    list: async () => {
      throw new ClientStoreError('CLIENT_RECORDS_TABLE_MISSING', 503, 'apply the migration');
    },
    upsert: async () => {},
  };

  const result = await syncAlpha(async () => failing);

  assert.equal(result.ok, false);
  assert.match(result.error, /CLIENT_RECORDS_TABLE_MISSING: apply the migration/);
});

// ---------------------------------------------------------------------------
// localDrift — does this machine's clients/ disagree with the store?
// ---------------------------------------------------------------------------

test('localDrift is null on a machine with no local client folders (e.g. a fresh clone)', () => {
  assert.equal(localDrift(path.join(root, 'nope'), [alpha]), null);
  writeJson('_template/meta.json', { id: '<<slug>>' });
  assert.equal(localDrift(root, [alpha]), null);
});

test('localDrift is null when every local client matches the store', () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  assert.equal(localDrift(root, [alpha, beta]), null);
});

test('localDrift lists local clients that are new to or differ from the store, and unreadable folders', () => {
  writeJson('client-alpha/meta.json', alphaMeta);
  writeJson('client-alpha/tasks.json', newTasks);
  writeJson('client-gamma/meta.json', {
    id: 'client-gamma',
    name: 'Example Gamma',
    status: 'active',
  });
  writeJson('client-delta/meta.json', '{ not json');

  const drift = localDrift(root, [alpha, beta]);

  assert.deepEqual(drift?.create, ['client-gamma']);
  assert.deepEqual(drift?.update, ['client-alpha']);
  assert.equal(drift?.problems.length, 1);
  assert.match(drift?.problems[0] ?? '', /^client-delta: meta\.json/);
});
