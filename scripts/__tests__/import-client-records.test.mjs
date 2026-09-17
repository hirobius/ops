/**
 * Tests for scripts/import-client-records.mjs — the one-time, idempotent import
 * of the local, gitignored clients/<slug>/ JSON into the private ClientStore.
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
} from '../import-client-records.mjs';
import { createMemoryClientStore } from '../../lib/clients/store.mjs';

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
