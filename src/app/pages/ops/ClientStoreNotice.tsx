/* hds-bypass: ops-internal component. */

/**
 * ClientStoreStatus — the shared loading / unavailable / empty states for every
 * /ops client surface that reads the private client store via
 * useClientRegistry() (GET /api/clients). Renders nothing once at least one
 * client record has loaded.
 *
 * ClientStoreDrift — the dev-only warning that this machine's gitignored
 * clients/<slug>/ folders (where records are still written) disagree with the
 * store, so the page is showing an older copy. Renders nothing otherwise.
 *
 * The error text is shown verbatim: the API and fetchClientRecords() already
 * phrase it as "what is wrong + the fix" (missing env var, migration not
 * applied, expired session), so the page never collapses it to "offline".
 *
 * @category Internal
 * @tier utility
 */

import { Callout, EmptyState } from '@hirobius/design-system';
import type { UseClientRegistryResult } from './clientRegistry';

const IMPORT_COMMAND = 'node --env-file=.env.local scripts/import-client-records.mjs --apply';

/** True once the registry has loaded with at least one client. */
export function hasClients(state: UseClientRegistryResult): boolean {
  return Boolean(state.registry && Object.keys(state.registry).length > 0);
}

export function ClientStoreStatus({ state }: { state: UseClientRegistryResult }) {
  if (hasClients(state)) return null;
  if (state.registry) {
    return (
      <EmptyState
        title="No client records in the store yet"
        description={`Import them on the machine that holds clients/<slug>/ JSON: ${IMPORT_COMMAND}`}
      />
    );
  }
  if (state.error) {
    return (
      <Callout tone="danger" role="alert">
        Client records unavailable — {state.error}
      </Callout>
    );
  }
  return <EmptyState title="Loading client records…" />;
}

export function ClientStoreDrift({ state }: { state: UseClientRegistryResult }) {
  const drift = state.localDrift;
  if (!drift) return null;
  const parts = [
    drift.create.length > 0 ? `not in the store: ${drift.create.join(', ')}` : '',
    drift.update.length > 0 ? `different from the store: ${drift.update.join(', ')}` : '',
    drift.problems.length > 0 ? `unreadable: ${drift.problems.join('; ')}` : '',
  ].filter(Boolean);
  return (
    <Callout tone="warning" role="status">
      This page shows the client store, and clients/ on this machine disagrees with it (
      {parts.join(' · ')}). Update the store with: {IMPORT_COMMAND}
    </Callout>
  );
}
