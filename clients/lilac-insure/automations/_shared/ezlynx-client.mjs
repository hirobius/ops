/**
 * EZLynx REST client — STUB until API key activation lands.
 *
 * Reference: https://documenter.getpostman.com/view/17108315/UVXjHahb
 * Activation: BGI Agency / EZLynx Support ticket #1943345.
 *
 * Every method routes through guardOutbound() so that in test mode the
 * intended payload is logged and no network traffic is generated.
 *
 * When the key arrives:
 *  1. Confirm EZLYNX_API_KEY + EZLYNX_AGENCY_ID are present (checkEnvKeys).
 *  2. Replace the dryRun branch with a real fetch() call.
 *  3. Add a smoke test (see EZLYNX.md → "Smoke test curl").
 *  4. Promote per workflow via the promotion checklist in each README.
 */

import { guardOutbound } from './test-mode-guard.mjs';
import { logEvent } from './log.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIELD_MAP_PATH = path.join(HERE, 'ezlynx-field-map.json');

let _fieldMapCache = null;
export function loadFieldMap() {
  if (_fieldMapCache) return _fieldMapCache;
  _fieldMapCache = JSON.parse(fs.readFileSync(FIELD_MAP_PATH, 'utf8'));
  return _fieldMapCache;
}

export function mapGravityToApplicant(gravityPayload) {
  const map = loadFieldMap().gravityToApplicant;
  const out = {};
  for (const [src, dest] of Object.entries(map)) {
    if (gravityPayload[src] !== undefined) out[dest] = gravityPayload[src];
  }
  return out;
}

async function dispatch({ rootConfig, workflow, channel, recipient, payload, op }) {
  const guarded = guardOutbound({ rootConfig, workflow, channel, recipient, payload });
  logEvent(rootConfig, {
    event: guarded.dryRun ? 'ezlynx-dryrun' : 'ezlynx-live',
    workflow,
    op,
    intendedRecipient: guarded.intendedRecipient,
    payloadSummary: summarize(payload),
  });
  if (guarded.dryRun) return { dryRun: true, op, payload };
  throw new Error(
    `[ezlynx-client] ${op} live mode reached but no fetch implementation — wire it before promoting`,
  );
}

function summarize(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const keys = Object.keys(payload);
  return { keyCount: keys.length, sampleKeys: keys.slice(0, 6) };
}

export async function createApplicant({ rootConfig, workflow, applicant }) {
  return dispatch({
    rootConfig, workflow, channel: 'ezlynx',
    recipient: applicant?.email,
    payload: applicant,
    op: 'POST /applicants',
  });
}

export async function getApplicant({ rootConfig, workflow, applicantId }) {
  logEvent(rootConfig, {
    event: rootConfig.mode === 'test' ? 'ezlynx-dryrun' : 'ezlynx-live',
    workflow, op: 'GET /applicants/:id', applicantId,
  });
  if (rootConfig.mode === 'test') return { dryRun: true, applicantId };
  throw new Error('[ezlynx-client] getApplicant live mode not yet wired');
}

export async function updatePolicy({ rootConfig, workflow, policyId, patch }) {
  return dispatch({
    rootConfig, workflow, channel: 'ezlynx',
    recipient: policyId, payload: patch,
    op: `PATCH /policies/${policyId}`,
  });
}

export async function createTask({ rootConfig, workflow, task }) {
  return dispatch({
    rootConfig, workflow, channel: 'ezlynx',
    recipient: task?.assigneeId, payload: task,
    op: 'POST /tasks',
  });
}

export async function attachDocument({ rootConfig, workflow, applicantId, doc }) {
  return dispatch({
    rootConfig, workflow, channel: 'ezlynx',
    recipient: applicantId, payload: doc,
    op: `POST /applicants/${applicantId}/documents`,
  });
}
