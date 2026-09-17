/**
 * Tests for scripts/clients-middleware.mjs — the dev mirror of GET /api/clients.
 * Besides answering like production, the dev server is the one place that can
 * see both the private store AND this machine's gitignored clients/<slug>/
 * folders, so it reports when they disagree (the page then shows the import
 * command instead of silently rendering stale records).
 *
 * In-memory store + a throwaway temp dir. Synthetic data only. No network, no git.
 */

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClientsMiddleware } from '../clients-middleware.mjs';
import { createMemoryClientStore, ClientStoreError } from '../../lib/clients/store.mjs';

let root;

const alpha = {
  slug: 'client-alpha',
  meta: { id: 'client-alpha', name: 'Jane Example Co', status: 'active' },
};

function writeJson(rel, value) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
}

async function get(middleware) {
  const res = fakeRes();
  await middleware.list({ method: 'GET' }, res, () => {
    throw new Error('GET must not fall through');
  });
  return res;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'clients-mw-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('GET answers the stored clients with no drift report when local folders match', async () => {
  writeJson('client-alpha/meta.json', alpha.meta);
  const mw = createClientsMiddleware({
    openStore: async () => createMemoryClientStore([alpha]),
    clientsDir: root,
  });

  const res = await get(mw);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { clients: [alpha] });
});

test('GET adds a localDrift report when clients/ on this machine differs from the store', async () => {
  writeJson('client-alpha/meta.json', { ...alpha.meta, status: 'paused' });
  writeJson('client-beta/meta.json', {
    id: 'client-beta',
    name: 'Example Beta',
    status: 'prospect',
  });
  const mw = createClientsMiddleware({
    openStore: async () => createMemoryClientStore([alpha]),
    clientsDir: root,
  });

  const res = await get(mw);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.clients, [alpha]);
  assert.deepEqual(res.body.localDrift, {
    create: ['client-beta'],
    update: ['client-alpha'],
    problems: [],
  });
});

test('a missing Supabase env is a 503 ENV_MISSING_SUPABASE, exactly like production', async () => {
  const mw = createClientsMiddleware({
    openStore: async () => {
      throw new Error('SUPABASE_MISSING_ENV: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    },
    clientsDir: root,
  });

  const res = await get(mw);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'ENV_MISSING_SUPABASE');
  assert.match(res.body.error, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('a store error keeps its status and code', async () => {
  writeJson('client-alpha/meta.json', alpha.meta);
  const mw = createClientsMiddleware({
    openStore: async () => ({
      list: async () => {
        throw new ClientStoreError('CLIENT_RECORDS_TABLE_MISSING', 503, 'apply the migration');
      },
      upsert: async () => {},
    }),
    clientsDir: root,
  });

  const res = await get(mw);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    error: 'CLIENT_RECORDS_TABLE_MISSING: apply the migration',
    code: 'CLIENT_RECORDS_TABLE_MISSING',
  });
});

test('non-GET requests fall through to the next middleware', async () => {
  const mw = createClientsMiddleware({
    openStore: async () => createMemoryClientStore(),
    clientsDir: root,
  });
  let nextCalled = false;
  await mw.list({ method: 'POST' }, fakeRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
