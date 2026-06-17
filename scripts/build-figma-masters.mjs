#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
// Standalone CLI: builds real Figma master components for the 13 generative-subset components.
// Triggers the bridge /build-masters endpoint.
// The bridge builds the batch and forwards draw-component to the plugin.
//
// Usage:
//   node scripts/build-figma-masters.mjs
//   pnpm ui:masters
//
// Prerequisites:
//   1. Figma plugin is open and connected to the bridge (bridge shows "1 client")
//   2. Bridge is running: node scripts/hds-bridge.mjs
//   3. For token bindings to resolve: run Step 0 (Sync Manifest → Variables) first

import { buildMastersBatch, GENERATIVE_SUBSET } from '../pipeline/figma-masters-batch.mjs';
import { log } from '../telemetry/logger.mjs';

const BRIDGE_BASE_URL = process.env.HDS_BRIDGE_URL || process.env.HDS_FIGMA_BRIDGE_URL || 'http://localhost:3005';
const BRIDGE_URL = `${BRIDGE_BASE_URL}/build-masters`;

async function main() {
  console.log('🧩 HDS Figma Masters Builder');
  console.log(`🌉 Bridge: ${BRIDGE_URL}`);
  console.log(`📦 Components: ${GENERATIVE_SUBSET.length}`);
  console.log('');

  const batch = buildMastersBatch();
  const totalStates = batch.reduce((n, b) => n + b.states.length, 0);
  console.log(`📐 Batch ready: ${batch.length} components · ${totalStates} total states`);

  log('build-masters.start', { components: batch.length, states: totalStates });

  let res;
  try {
    res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`❌ Bridge unreachable at ${BRIDGE_URL}`);
    console.error('   Start the bridge: node scripts/hds-bridge.mjs');
    log('build-masters.error', { error: 'bridge-unreachable', message: err.message });
    process.exitCode = 1;
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body && body.error ? body.error : `Bridge returned ${res.status}`;
    console.error(`❌ ${message}`);
    log('build-masters.error', {
      error: body && body.status ? body.status : 'bridge-error',
      status: res.status,
      message,
    });
    process.exitCode = 1;
    return;
  }

  const data = await res.json().catch(() => ({}));
  console.log(`✅ Dispatched to ${data.clients ?? '?'} plugin client(s) (seq ${data.sequence ?? '?'})`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Verify the "🗂️ HDS: Sticker Sheet" page appeared in Figma');
  console.log('  2. Wait for the plugin to refresh the registry after draw completion');
  console.log('  3. Run pnpm ui:gen "<prompt>" — instances should resolve to real components');

  log('build-masters.dispatched', { clients: data.clients, sequence: data.sequence });
}

main().catch(err => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
