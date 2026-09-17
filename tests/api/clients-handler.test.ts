// @vitest-environment node
/**
 * api/clients.ts — GET /api/clients, the read side of the private client store.
 * The inner handler takes a ClientStore, so it is exercised with the in-memory
 * adapter: no Supabase, no cookie, no env (ADR-0004 seam). Synthetic data only.
 */
import { describe, it, expect } from 'vitest';
import { clientsHandler } from '../../api/clients';
import { createMemoryClientStore, ClientStoreError } from '../../lib/clients/store.mjs';

const alpha = {
  slug: 'client-alpha',
  meta: { id: 'client-alpha', name: 'Jane Example Co', status: 'active' },
};

describe('clientsHandler', () => {
  it('returns every stored record', async () => {
    const result = await clientsHandler(createMemoryClientStore([alpha]));
    expect(result).toEqual({ status: 200, body: { clients: [alpha] } });
  });

  it('an empty store is a 200 with no clients (the page explains the import step)', async () => {
    const result = await clientsHandler(createMemoryClientStore());
    expect(result).toEqual({ status: 200, body: { clients: [] } });
  });

  it('a store error keeps its status, code and actionable message', async () => {
    const failing = {
      list: async () => {
        throw new ClientStoreError('CLIENT_RECORDS_TABLE_MISSING', 503, 'apply the migration');
      },
      upsert: async () => {},
    };
    const result = await clientsHandler(failing);
    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      error: 'CLIENT_RECORDS_TABLE_MISSING: apply the migration',
      code: 'CLIENT_RECORDS_TABLE_MISSING',
    });
  });

  it('an unexpected throw becomes a 500 with the message', async () => {
    const failing = {
      list: async () => {
        throw new Error('socket hang up');
      },
      upsert: async () => {},
    };
    expect(await clientsHandler(failing)).toEqual({
      status: 500,
      body: { error: 'socket hang up' },
    });
  });
});
