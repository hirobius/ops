#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
// Phase 1 integration test — bypasses the LLM and posts ADD_NODE commands
// directly to the bridge so variable binding and smart placement can be
// verified in Figma independently of model quality.
//
// What to check in Figma after running:
//   1. Variable binding: click any generated frame → inspect fills/strokes in
//      the right panel. They should show variable chips (e.g. "semantic.color.surface.raised")
//      not raw hex values. If HDS variables haven't been synced yet, run Sync Tokens first.
//   2. Smart placement: two root frames are generated in sequence. "Card 2" should
//      appear 100px to the right of "Card 1" (Card 1 is 360px wide → Card 2 at x=460).

const BRIDGE_BASE = (process.env.HDS_FIGMA_BRIDGE_URL || 'http://localhost:3005/generate')
  .replace(/\/generate$/, '');
const BRIDGE_URL = BRIDGE_BASE + '/generate';

/** Returns true if the bridge is reachable, false otherwise. */
async function isBridgeUp() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    // Try GET /stream (SSE endpoint that exists on the bridge) as a health proxy.
    // We only care about connection success, not response body.
    await fetch(`${BRIDGE_BASE}/stream`, { method: 'GET', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function send(command) {
  const res = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: JSON.stringify(command) + '\n',
  });
  if (!res.ok && res.status !== 207) {
    throw new Error(`Bridge error ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  const mark = body.accepted > 0 ? '✓' : '✗';
  console.log(`  ${mark} ${command.id} (accepted=${body.accepted}, clients=${body.clients})`);
}

async function run() {
  // Pre-flight: skip gracefully when bridge is not running
  const bridgeAvailable = await isBridgeUp();
  if (!bridgeAvailable) {
    console.log('[test:phase1] bridge unavailable — skipping (start bridge with: node scripts/hds-bridge.mjs)');
    process.exit(0);
  }

  console.log('\n🧪 Phase 1 Test: Variable Binding + Smart Placement');
  console.log('   Bridge:', BRIDGE_URL);
  console.log('   Ensure the bridge is running: node scripts/hds-bridge.mjs\n');

  // ── Generation 1: card with semantic token fills ──────────────────────────
  console.log('Generation 1 — card with semantic color tokens:');
  await send({
    action: 'ADD_NODE', id: 'p1-card-1', parentId: 'root', type: 'FRAME',
    props: {
      name: 'Phase1 Card 1', width: 360, height: 200,
      layoutMode: 'VERTICAL', itemSpacing: 16, padding: 24,
      fill: 'semantic.color.surface.raised',
      stroke: 'semantic.color.border.default',
      radius: 8,
    },
  });
  await send({
    action: 'ADD_NODE', id: 'p1-heading-1', parentId: 'p1-card-1', type: 'TEXT',
    props: {
      name: 'Heading', text: 'Card Title',
      typography: 'semantic.typography.h3',
      fill: 'semantic.color.content.primary',
    },
  });
  await send({
    action: 'ADD_NODE', id: 'p1-body-1', parentId: 'p1-card-1', type: 'TEXT',
    props: {
      name: 'Body', text: 'This is the card body paragraph.',
      typography: 'semantic.typography.body',
      fill: 'semantic.color.content.secondary',
    },
  });

  // Small delay so the first frame is committed to the canvas before the
  // second generation scan runs. The plugin is async so we give it 600 ms.
  await new Promise(r => setTimeout(r, 600));

  // ── Generation 2: second card — smart placement check ────────────────────
  console.log('\nGeneration 2 — second card (expect x ≈ 460, i.e. 360 + 100 gap):');
  await send({
    action: 'ADD_NODE', id: 'p1-card-2', parentId: 'root', type: 'FRAME',
    props: {
      name: 'Phase1 Card 2', width: 360, height: 200,
      layoutMode: 'VERTICAL', itemSpacing: 16, padding: 24,
      fill: 'semantic.color.surface.page',
      stroke: 'semantic.color.border.subdued',
      radius: 8,
    },
  });
  await send({
    action: 'ADD_NODE', id: 'p1-heading-2', parentId: 'p1-card-2', type: 'TEXT',
    props: {
      name: 'Heading', text: 'Second Card',
      typography: 'semantic.typography.h3',
      fill: 'semantic.color.content.primary',
    },
  });

  console.log('\n✅ Commands sent. Switch to Figma and verify:');
  console.log('   [Variable binding]  Select "Phase1 Card 1" → fills should show variable chips,');
  console.log('                       not raw hex. (Run Sync Tokens first if variables are missing.)');
  console.log('   [Smart placement]   "Phase1 Card 2" x position should be ~460 (360 + 100 gap).');
}

run().catch(err => {
  console.error('\n❌ Test error:', err.message);
  process.exit(1);
});
