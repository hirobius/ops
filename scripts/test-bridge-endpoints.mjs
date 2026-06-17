#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/test-bridge-endpoints.mjs
 *
 * Validates the 11a-2 orchestration approval endpoints:
 *
 *   GET  /orchestration/list                       → list + ?approval= filter
 *   POST /orchestration/approve { id, approval, … } → mutate + history append
 *
 * Strategy:
 *   1. Snapshot docs/ai/orchestration.json and orchestration.history.jsonl
 *      before the test starts.
 *   2. Import the express `app` from scripts/hds-bridge.mjs (which only
 *      auto-listens when invoked as the entry module).
 *   3. Bind the app to an ephemeral loopback port via app.listen(0, '127.0.0.1').
 *   4. Drive every endpoint with native fetch and assert response shapes
 *      with node:assert.
 *   5. Always restore the snapshot in the `finally` block, even on failure.
 *
 * The validator never mutates orchestration.json on disk past the snapshot
 * point — every commit-visible byte is restored before exit.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCHESTRATION_PATH = path.join(ROOT, 'docs/ai/orchestration.json');
const HISTORY_PATH = path.join(ROOT, 'docs/ai/orchestration.history.jsonl');

function snapshot() {
  return {
    orchestration: fs.readFileSync(ORCHESTRATION_PATH, 'utf8'),
    historyExists: fs.existsSync(HISTORY_PATH),
    history: fs.existsSync(HISTORY_PATH) ? fs.readFileSync(HISTORY_PATH, 'utf8') : null,
  };
}

function restore(snap) {
  fs.writeFileSync(ORCHESTRATION_PATH, snap.orchestration);
  if (snap.historyExists) {
    fs.writeFileSync(HISTORY_PATH, snap.history);
  } else if (fs.existsSync(HISTORY_PATH)) {
    fs.unlinkSync(HISTORY_PATH);
  }
}

async function main() {
  const snap = snapshot();
  let server;
  let exitCode = 0;

  try {
    const { app } = await import('./hds-bridge.mjs');

    // Bind to loopback ephemeral port.
    const baseUrl = await new Promise((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (err) => {
        if (err) return reject(err);
        const addr = server.address();
        resolve(`http://127.0.0.1:${addr.port}`);
      });
      server.on('error', reject);
    });

    console.log(`Test server bound at ${baseUrl}`);

    // === Test 1: GET /orchestration/list (no filter) ===
    {
      const r = await fetch(`${baseUrl}/orchestration/list`);
      assert.equal(r.status, 200, 'list: 200');
      const body = await r.json();
      assert.equal(body.status, 'ok', 'list: status ok');
      assert.equal(typeof body.total, 'number', 'list: total is number');
      assert.equal(body.total, body.units.length, 'list: total matches units.length when unfiltered');
      assert.equal(body.filter, null, 'list: filter is null when unset');
      assert.ok(body.total > 0, 'list: at least one unit returned');
      console.log(`  ✔ GET /orchestration/list → ${body.total} units`);
    }

    // === Test 2: GET /orchestration/list?approval=approved (filtered) ===
    {
      const r = await fetch(`${baseUrl}/orchestration/list?approval=approved`);
      assert.equal(r.status, 200, 'list-filtered: 200');
      const body = await r.json();
      assert.equal(body.status, 'ok', 'list-filtered: status ok');
      assert.equal(body.filter, 'approved', 'list-filtered: filter passes through');
      assert.ok(Array.isArray(body.units), 'list-filtered: units is array');
      for (const u of body.units) {
        assert.equal(u.approval, 'approved', `list-filtered: unit ${u.id} matches filter`);
      }
      console.log(`  ✔ GET /orchestration/list?approval=approved → ${body.count} units (all approval=approved)`);
    }

    // === Test 3: GET /orchestration/list?approval=proposed ===
    {
      const r = await fetch(`${baseUrl}/orchestration/list?approval=proposed`);
      assert.equal(r.status, 200, 'list-proposed: 200');
      const body = await r.json();
      assert.equal(body.filter, 'proposed', 'list-proposed: filter passes through');
      for (const u of body.units) {
        assert.equal(u.approval, 'proposed', `list-proposed: unit ${u.id} matches filter`);
      }
      console.log(`  ✔ GET /orchestration/list?approval=proposed → ${body.count} units`);
    }

    // === Test 4: POST /orchestration/approve — missing id ===
    {
      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval: 'approved' }),
      });
      assert.equal(r.status, 400, 'approve-no-id: 400');
      const body = await r.json();
      assert.equal(body.status, 'error', 'approve-no-id: status error');
      assert.match(body.error, /id is required/, 'approve-no-id: error message');
      console.log('  ✔ POST /orchestration/approve (missing id) → 400');
    }

    // === Test 5: POST /orchestration/approve — bad approval value ===
    {
      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'backlog-3-component-prefix-rename', approval: 'maybe-someday' }),
      });
      assert.equal(r.status, 400, 'approve-bad-approval: 400');
      const body = await r.json();
      assert.match(body.error, /approval must be one of/, 'approve-bad-approval: error message');
      console.log('  ✔ POST /orchestration/approve (bad approval) → 400');
    }

    // === Test 6: POST /orchestration/approve — unknown unit id ===
    {
      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'no-such-unit-anywhere', approval: 'approved' }),
      });
      assert.equal(r.status, 404, 'approve-unknown-id: 404');
      const body = await r.json();
      assert.match(body.error, /unit not found/, 'approve-unknown-id: error message');
      console.log('  ✔ POST /orchestration/approve (unknown id) → 404');
    }

    // === Test 7: POST /orchestration/approve — proposed → pending status flip ===
    {
      // Reset backlog-3 to proposed/proposed state before this test so the
      // flip assertion is deterministic regardless of current on-disk state.
      {
        const setupData = JSON.parse(fs.readFileSync(ORCHESTRATION_PATH, 'utf8'));
        const setupUnit = setupData.units.find((x) => x.id === 'backlog-3-component-prefix-rename');
        if (setupUnit) {
          setupUnit.status = 'proposed';
          setupUnit.approval = 'proposed';
          fs.writeFileSync(ORCHESTRATION_PATH, JSON.stringify(setupData, null, 2) + '\n');
        }
      }
      // backlog-3 is the canonical test fixture for the approval state machine.
      // Approving it should flip status to pending per Q1=(a).
      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'backlog-3-component-prefix-rename',
          approval: 'approved',
          comment: 'test ratification — automated test',
        }),
      });
      assert.equal(r.status, 200, 'approve-flip: 200');
      const body = await r.json();
      assert.equal(body.status, 'ok', 'approve-flip: status ok');
      assert.equal(body.id, 'backlog-3-component-prefix-rename', 'approve-flip: id echoed');
      assert.equal(body.approval, 'approved', 'approve-flip: approval set');
      assert.equal(body.previousStatus, 'proposed', 'approve-flip: previousStatus captured');
      assert.equal(body.currentStatus, 'pending', 'approve-flip: status flipped to pending');
      assert.equal(body.statusFlipped, true, 'approve-flip: statusFlipped=true');
      console.log('  ✔ POST /orchestration/approve approved → status proposed→pending');

      // Verify file actually mutated.
      const data = JSON.parse(fs.readFileSync(ORCHESTRATION_PATH, 'utf8'));
      const u = data.units.find((x) => x.id === 'backlog-3-component-prefix-rename');
      assert.equal(u.approval, 'approved', 'approve-flip: persisted approval');
      assert.equal(u.status, 'pending', 'approve-flip: persisted status');

      // Verify history.jsonl appended.
      assert.ok(fs.existsSync(HISTORY_PATH), 'approve-flip: history file exists');
      const lines = fs.readFileSync(HISTORY_PATH, 'utf8').trim().split('\n');
      const lastEvent = JSON.parse(lines[lines.length - 1]);
      assert.equal(lastEvent.action, 'approve', 'history: action');
      assert.equal(lastEvent.id, 'backlog-3-component-prefix-rename', 'history: id');
      assert.equal(lastEvent.statusFlipped, true, 'history: statusFlipped');
      assert.equal(lastEvent.from.status, 'proposed', 'history: from.status');
      assert.equal(lastEvent.to.status, 'pending', 'history: to.status');
      assert.equal(lastEvent.comment, 'test ratification — automated test', 'history: comment passthrough');
      console.log('  ✔ history.jsonl appended with approve event');
    }

    // === Test 8: POST /orchestration/approve — denied does NOT flip status ===
    {
      // Reset for a clean denied-path test: we already mutated backlog-3, so
      // we re-set its status back to proposed in-memory then deny it.
      const data = JSON.parse(fs.readFileSync(ORCHESTRATION_PATH, 'utf8'));
      const u = data.units.find((x) => x.id === 'backlog-3-component-prefix-rename');
      u.status = 'proposed';
      u.approval = 'proposed';
      fs.writeFileSync(ORCHESTRATION_PATH, JSON.stringify(data, null, 2) + '\n');

      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'backlog-3-component-prefix-rename',
          approval: 'denied',
        }),
      });
      assert.equal(r.status, 200, 'approve-deny: 200');
      const body = await r.json();
      assert.equal(body.statusFlipped, false, 'approve-deny: statusFlipped=false');
      assert.equal(body.currentStatus, 'proposed', 'approve-deny: status unchanged');
      assert.equal(body.approval, 'denied', 'approve-deny: approval=denied');
      console.log('  ✔ POST /orchestration/approve denied → status NOT flipped');
    }

    // === Test 9: POST /orchestration/approve with edits ===
    {
      const data = JSON.parse(fs.readFileSync(ORCHESTRATION_PATH, 'utf8'));
      const u = data.units.find((x) => x.id === 'backlog-3-component-prefix-rename');
      u.status = 'proposed';
      u.approval = 'proposed';
      const originalPriority = u.priority;
      fs.writeFileSync(ORCHESTRATION_PATH, JSON.stringify(data, null, 2) + '\n');

      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'backlog-3-component-prefix-rename',
          approval: 'needs-grilling',
          edits: { priority: 2, sprint: 5 },
        }),
      });
      assert.equal(r.status, 200, 'approve-edits: 200');
      const body = await r.json();
      assert.deepEqual(body.editsApplied.sort(), ['priority', 'sprint'], 'approve-edits: editsApplied');
      const data2 = JSON.parse(fs.readFileSync(ORCHESTRATION_PATH, 'utf8'));
      const u2 = data2.units.find((x) => x.id === 'backlog-3-component-prefix-rename');
      assert.equal(u2.priority, 2, 'approve-edits: priority persisted');
      assert.equal(u2.sprint, 5, 'approve-edits: sprint persisted');
      assert.equal(u2.approval, 'needs-grilling', 'approve-edits: approval=needs-grilling');
      assert.notEqual(u2.priority, originalPriority, 'approve-edits: priority actually changed');
      console.log('  ✔ POST /orchestration/approve with edits → fields mutated');
    }

    // === Test 10: POST /orchestration/approve with bad edit (out-of-range priority) ===
    {
      const r = await fetch(`${baseUrl}/orchestration/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'backlog-3-component-prefix-rename',
          approval: 'approved',
          edits: { priority: 99 },
        }),
      });
      assert.equal(r.status, 400, 'approve-bad-edit: 400');
      const body = await r.json();
      assert.match(body.error, /invalid edits/, 'approve-bad-edit: error message');
      assert.ok(Array.isArray(body.invalid), 'approve-bad-edit: invalid array');
      console.log('  ✔ POST /orchestration/approve bad edit (priority=99) → 400');
    }

    // === Test 11: GET /build-status (12h-4) ===
    {
      const r = await fetch(`${baseUrl}/build-status`);
      assert.equal(r.status, 200, 'build-status: 200');
      const body = await r.json();
      assert.equal(body.status, 'ok', 'build-status: status ok');
      assert.equal(typeof body.totalUnits, 'number', 'build-status: totalUnits is number');
      assert.ok(body.totalUnits > 0, 'build-status: at least one unit');
      assert.equal(typeof body.done, 'number', 'build-status: done is number');
      assert.equal(typeof body.inProgress, 'number', 'build-status: inProgress is number');
      assert.equal(typeof body.pending, 'number', 'build-status: pending is number');
      assert.ok(Array.isArray(body.phases), 'build-status: phases is array');
      assert.ok(body.phases.length > 0, 'build-status: at least one phase');
      // Each phase has phase, done, total fields
      for (const ph of body.phases) {
        assert.ok('phase' in ph, 'build-status phase: has phase field');
        assert.equal(typeof ph.done, 'number', 'build-status phase: done is number');
        assert.equal(typeof ph.total, 'number', 'build-status phase: total is number');
        assert.ok(ph.total > 0, `build-status phase ${ph.phase}: total > 0`);
        assert.ok(ph.done <= ph.total, `build-status phase ${ph.phase}: done <= total`);
      }
      // Sanity: done + inProgress + pending should not exceed totalUnits
      // (denied/parked units are not counted in any bucket so sum <= total)
      assert.ok(
        body.done + body.inProgress + body.pending <= body.totalUnits,
        'build-status: done+inProgress+pending <= totalUnits'
      );
      console.log(
        `  ✔ GET /build-status → ${body.totalUnits} units · ${body.done} done · ` +
        `${body.inProgress} active · ${body.pending} pending · ${body.phases.length} phases`
      );
    }

    console.log('\nAll bridge endpoint tests passed.');
  } catch (err) {
    console.error('\n✗ Test failure:', err.message);
    if (err.stack) console.error(err.stack);
    exitCode = 1;
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(() => resolve()));
    }
    restore(snap);
  }

  process.exit(exitCode);
}

main();
