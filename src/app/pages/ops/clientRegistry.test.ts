/**
 * clientRegistry — the browser side of the client-store seam. The /ops client
 * surfaces no longer bake clients/<slug>/*.json into the bundle; they fetch
 * GET /api/clients and assemble a slug-keyed registry. These tests pin the
 * assembly and the fail-loud error text a page shows when the store is not
 * reachable. Synthetic data only (client-alpha, example.com).
 */
import { describe, it, expect, vi } from 'vitest';
import { buildClientRegistry, fetchClientRecords, type ClientRecord } from './clientRegistry';

const alpha: ClientRecord = {
  slug: 'client-alpha',
  meta: { id: 'client-alpha', name: 'Jane Example Co', status: 'active' } as ClientRecord['meta'],
  tasks: { phases: [] },
  workflows: [
    { id: 'lead-intake', config: { id: 'lead-intake' } },
    { id: 'email-triage', config: { id: 'email-triage' } },
  ],
  brandAudit: { summary: 'Synthetic audit.' },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('buildClientRegistry', () => {
  it('keys records by slug, carrying every file the pages read', () => {
    const reg = buildClientRegistry([alpha]);
    expect(Object.keys(reg)).toEqual(['client-alpha']);
    expect(reg['client-alpha'].meta.name).toBe('Jane Example Co');
    expect(reg['client-alpha'].tasks).toEqual({ phases: [] });
    expect(reg['client-alpha'].brandAudit).toEqual({ summary: 'Synthetic audit.' });
  });

  it('sorts workflows by id and skips scaffold slugs', () => {
    const reg = buildClientRegistry([alpha, { ...alpha, slug: '_template' }]);
    expect(Object.keys(reg)).toEqual(['client-alpha']);
    expect(reg['client-alpha'].workflows?.map((w) => w.id)).toEqual([
      'email-triage',
      'lead-intake',
    ]);
  });
});

describe('fetchClientRecords', () => {
  it('returns the records from GET /api/clients', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { clients: [alpha] }));
    await expect(fetchClientRecords(undefined, fetchImpl)).resolves.toEqual({
      clients: [alpha],
      localDrift: null,
    });
    expect(fetchImpl).toHaveBeenCalledWith('/api/clients', { signal: undefined });
  });

  it("passes the dev server's local-drift report through so the page can warn", async () => {
    const localDrift = { create: ['client-gamma'], update: ['client-alpha'], problems: [] };
    const fetchImpl = vi.fn(async () => jsonResponse(200, { clients: [alpha], localDrift }));
    await expect(fetchClientRecords(undefined, fetchImpl)).resolves.toEqual({
      clients: [alpha],
      localDrift,
    });
  });

  it('surfaces the store error verbatim so the page can show the fix', async () => {
    const error =
      'CLIENT_RECORDS_TABLE_MISSING: the client_records table does not exist yet. Apply supabase/migrations/0015_client_records.sql …';
    const fetchImpl = vi.fn(async () =>
      jsonResponse(503, { error, code: 'CLIENT_RECORDS_TABLE_MISSING' }),
    );
    await expect(fetchClientRecords(undefined, fetchImpl)).rejects.toThrow(error);
  });

  it('a missing Supabase env names the variables and where to set them', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(503, {
        error:
          'SUPABASE_MISSING_ENV: set a Supabase URL (SUPABASE_URL …) and SUPABASE_SERVICE_ROLE_KEY',
        code: 'ENV_MISSING_SUPABASE',
      }),
    );
    const err = await fetchClientRecords(undefined, fetchImpl).catch((e: unknown) => e as Error);
    expect(err.message).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(err.message).toContain(
      'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables',
    );
  });

  it('an expired ops session says to sign in again', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(401, { error: 'Unauthorized.', code: 'UNAUTHENTICATED' }),
    );
    await expect(fetchClientRecords(undefined, fetchImpl)).rejects.toThrow(/sign in again/);
  });

  it('a non-JSON failure still names the endpoint and status', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>502</html>', { status: 502 }));
    await expect(fetchClientRecords(undefined, fetchImpl)).rejects.toThrow(
      'GET /api/clients failed: HTTP 502',
    );
  });
});
