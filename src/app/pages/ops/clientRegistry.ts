/**
 * Client registry — the browser side of the private client store.
 *
 * Client records live OUT of the public repo: in the Supabase `client_records`
 * table behind the ClientStore port (lib/clients/store.mjs), served by
 * GET /api/clients (api/clients.ts; scripts/clients-middleware.mjs in dev).
 * Nothing under clients/ is baked into the bundle any more — the old
 * import.meta.glob reads only ever worked on a machine holding the gitignored
 * files, and a committed record would have shipped in the public build.
 *
 * - fetchClientRecords(): one GET, with fail-loud errors that carry the fix.
 * - buildClientRegistry(): records → slug-keyed ClientFiles map (pure).
 * - useClientRegistry(): the hook every client surface reads through.
 */

import { useMemo } from 'react';
import { usePoll } from '../../lib/usePoll';
import type { ClientFiles, ClientRecord } from './clientTypes';

export type { ClientRecord } from './clientTypes';

const ENDPOINT = '/api/clients';
const POLL_INTERVAL_MS = 60_000;
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/** Skip slugs starting with `_` (e.g. `_template`) — scaffolding, never a client. */
function shouldRegister(slug: string) {
  return Boolean(slug) && !slug.startsWith('_');
}

/** Join fetched client records into a registry keyed by slug. Pure. */
export function buildClientRegistry(records: ClientRecord[]): Record<string, ClientFiles> {
  const reg: Record<string, ClientFiles> = {};
  for (const { slug, status: _status, ...files } of records) {
    if (!shouldRegister(slug) || !files.meta) continue;
    reg[slug] = files.workflows
      ? { ...files, workflows: [...files.workflows].sort((a, b) => a.id.localeCompare(b.id)) }
      : files;
  }
  return reg;
}

/** The actionable message for a failed GET /api/clients. */
async function failureMessage(res: Response): Promise<string> {
  if (res.status === 401) {
    return 'Ops session expired (401 from /api/clients) — reload /ops and sign in again.';
  }
  let body: { error?: unknown; code?: unknown } | null = null;
  try {
    body = (await res.json()) as { error?: unknown; code?: unknown };
  } catch {
    body = null;
  }
  if (!body || typeof body.error !== 'string') return `GET ${ENDPOINT} failed: HTTP ${res.status}`;
  if (body.code === 'ENV_MISSING_SUPABASE') {
    return (
      `${body.error} — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel ` +
      `(${VERCEL_ENV_URL}, Production + Preview) and redeploy; for local dev they come from .env.local.`
    );
  }
  return body.error;
}

/** GET /api/clients → ClientRecord[]. Throws an Error whose message names the fix. */
export async function fetchClientRecords(
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ClientRecord[]> {
  const res = await fetchImpl(ENDPOINT, { signal });
  if (!res.ok) throw new Error(await failureMessage(res));
  const body = (await res.json()) as { clients?: ClientRecord[] };
  return body.clients ?? [];
}

export interface UseClientRegistryResult {
  /** null until the first successful load. */
  registry: Record<string, ClientFiles> | null;
  error: string | null;
  isInitialLoading: boolean;
}

/** The client registry every /ops client surface reads through. */
export function useClientRegistry(): UseClientRegistryResult {
  const { data, error, isInitialLoading } = usePoll<ClientRecord[]>(
    (signal) => fetchClientRecords(signal),
    { intervalMs: POLL_INTERVAL_MS },
  );
  const registry = useMemo(() => (data ? buildClientRegistry(data) : null), [data]);
  return { registry, error, isInitialLoading };
}
