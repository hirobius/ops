#!/usr/bin/env node
/**
 * scripts/log-call.mjs — record the outcome of one call.
 *
 * Without this, 200 calls produce anecdotes. With it they produce a funnel you
 * can divide: dials -> reached -> interested -> booked.
 *
 *   node scripts/log-call.mjs --id <lead-id> --outcome voicemail
 *   node scripts/log-call.mjs --id <lead-id> --outcome callback --callback 2026-09-17T09:00
 *   node scripts/log-call.mjs --id <lead-id> --outcome interested --notes "wants mobile fixed"
 *   node scripts/log-call.mjs --funnel
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Adrian-set; agents never read
 * or write .env* files).
 */

import { RETRY_OUTCOMES, TERMINAL_OUTCOMES } from '../lib/leads/call-list.mjs';

const OUTCOMES = [...RETRY_OUTCOMES, ...TERMINAL_OUTCOMES, 'callback', 'interested'];

function parseArgs(argv) {
  const o = { id: null, outcome: null, notes: null, callback: null, funnel: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--id') o.id = argv[++i];
    else if (a === '--outcome') o.outcome = argv[++i];
    else if (a === '--notes') o.notes = argv[++i];
    else if (a === '--callback') o.callback = argv[++i];
    else if (a === '--funnel') o.funnel = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`log-call.mjs — record one call outcome.

Usage:
  node scripts/log-call.mjs --id <lead-id> --outcome <outcome> [--notes "..."] [--callback <iso>]
  node scripts/log-call.mjs --funnel

Outcomes:
  retry again later : ${RETRY_OUTCOMES.join(', ')}
  done, never again : ${TERMINAL_OUTCOMES.join(', ')}
  a real outcome    : callback, interested

Notes:
  - Every call increments call_attempts, including a no-answer. That is the point:
    "dialled 3 times, never reached" is a finding, not a gap.
  - --outcome do-not-call ALSO sets do_not_contact, so the lead is suppressed on
    every channel, not just the phone.
  - --outcome callback requires --callback <iso>; the lead is then hidden from the
    queue until that time.
`);
}

async function showFunnel(sb) {
  const { data, error } = await sb.from('leads').select('call_outcome,call_attempts');
  if (error) throw new Error(`Supabase read failed: ${error.message || error}`);
  const rows = data || [];
  const dialled = rows.filter((r) => (Number(r.call_attempts) || 0) > 0);
  const dials = dialled.reduce((a, r) => a + (Number(r.call_attempts) || 0), 0);
  const counts = {};
  for (const r of rows)
    if (r.call_outcome) counts[r.call_outcome] = (counts[r.call_outcome] || 0) + 1;

  // "Reached" = a human was on the line. Voicemail and no-answer are not contact.
  const reached = rows.filter((r) =>
    [
      'gatekeeper',
      'not-interested',
      'callback',
      'interested',
      'meeting-booked',
      'wrong-number',
    ].includes(r.call_outcome),
  ).length;

  console.log(`dials placed:   ${dials} across ${dialled.length} lead(s)`);
  console.log(
    `humans reached: ${reached}${dials ? `  (${Math.round((reached / dials) * 100)}% of dials)` : ''}`,
  );
  console.log('\noutcomes:');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
  if (!Object.keys(counts).length) console.log('  (none logged yet)');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return printHelp();

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();

  if (o.funnel) return showFunnel(sb);

  if (!o.id || !o.outcome) {
    console.error('Need --id and --outcome. Run --help for the outcome vocabulary.');
    process.exitCode = 1;
    return;
  }
  if (!OUTCOMES.includes(o.outcome)) {
    console.error(`Unknown outcome "${o.outcome}". Valid: ${OUTCOMES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (o.outcome === 'callback' && !o.callback) {
    console.error(
      '--outcome callback requires --callback <iso timestamp>, e.g. --callback 2026-09-17T09:00',
    );
    process.exitCode = 1;
    return;
  }

  const { data: existing, error: rerr } = await sb
    .from('leads')
    .select('id,name,call_attempts')
    .eq('id', o.id)
    .maybeSingle();
  if (rerr) throw new Error(`Supabase read failed: ${rerr.message || rerr}`);
  if (!existing) {
    console.error(`No lead with id ${o.id}.`);
    process.exitCode = 1;
    return;
  }

  const patch = {
    call_attempts: (Number(existing.call_attempts) || 0) + 1,
    last_call_at: new Date().toISOString(),
    call_outcome: o.outcome,
    contact_channel: 'call',
    contacted_at: new Date().toISOString(),
  };
  if (o.notes) patch.call_notes = o.notes;
  if (o.callback) patch.callback_at = new Date(o.callback).toISOString();
  if (o.outcome === 'do-not-call') {
    patch.do_not_contact = true;
    patch.suppression_reason = 'verbal do-not-call';
  }

  const { error } = await sb.from('leads').update(patch).eq('id', o.id);
  if (error) throw new Error(`Supabase write failed: ${error.message || error}`);

  console.log(`${existing.name}: ${o.outcome} (attempt ${patch.call_attempts})`);
  if (patch.do_not_contact) console.log('  suppressed on ALL channels, not just phone.');
  if (patch.callback_at) console.log(`  hidden from the queue until ${patch.callback_at}`);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
