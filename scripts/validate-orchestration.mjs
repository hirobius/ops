#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/validate-orchestration.mjs
 *
 * Validates docs/ai/orchestration.json schema extension landed for the
 * approval-app meta-cluster (11-A). Every non-done unit must carry the
 * four classifier fields the approval app reads:
 *
 *   priority  — integer 1..5 (1 = highest)
 *   sprint    — integer 0..6 (0 = current sprint, 6 = far backlog)
 *   cluster   — non-empty string (groups units into approvable batches)
 *   approval  — one of: proposed | approved | denied | needs-grilling
 *
 * Done units are intentionally not annotated to keep the audit trail
 * clean — schema extension is additive, not retroactive.
 *
 * Modes:
 *   default              — exits 1 on any schema violation
 *   --soft               — prints warnings and exits 0 (initial wiring; promote to
 *                          hard-fail per the 8p-6/8p-7 pattern after a clean-up pass)
 *   --verbose            — log walked count
 *   --strict-validation  — additionally requires every approved unit to carry a
 *                          non-trivial validationCmd (Boris Cherny "2-3x quality").
 *                          In strict mode, units with missing/trivial validationCmd
 *                          exit 1 with a violators list. Default mode: warn-only.
 *
 * Invocation:
 *   node scripts/validate-orchestration.mjs                   # hard (schema only)
 *   node scripts/validate-orchestration.mjs --soft            # warn-only
 *   node scripts/validate-orchestration.mjs --verbose         # log walked count
 *   node scripts/validate-orchestration.mjs --strict-validation  # schema + validationCmd gate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isFixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const ORCHESTRATION_PATH = (isFixtureMode && process.env.FIXTURE_FILE)
  ? path.resolve(process.env.FIXTURE_FILE)
  : path.join(ROOT, 'docs/ai/orchestration.json');

const SOFT = process.argv.includes('--soft');
const VERBOSE = process.argv.includes('--verbose');
const STRICT_VALIDATION = process.argv.includes('--strict-validation');

export const APPROVAL_VALUES = new Set(['proposed', 'approved', 'denied', 'needs-grilling']);
export const STATUS_VALUES = new Set([
  'proposed',
  'approved',
  'claimed',
  'done',
  'parked',
  'needs-grilling',
  'denied',
]);
export const PRIORITY_MIN = 1;
export const PRIORITY_MAX = 5;
export const SPRINT_MIN = 0;
export const SPRINT_MAX = 6;

/**
 * Patterns that indicate a trivial / placeholder validationCmd.
 * A command matching any of these is treated as "no real validation" in strict mode.
 *
 * Boris Cherny: "verification = 2-3x quality". A check that always passes
 * regardless of whether the unit's work exists is not a verification.
 */
export const FORBIDDEN_VALIDATION_PATTERNS = [
  /^\s*$/,                    // empty string or whitespace only
  /^echo\b/,                  // any echo command
  /^true\s*$/,                // bare `true`
  /^exit\s+0\s*$/,            // bare `exit 0`
  /^:\s*$/,                   // shell no-op `:`
];

/**
 * Returns true if the validationCmd is trivial/forbidden in strict mode.
 */
export function isTrivialValidationCmd(cmd) {
  if (cmd === undefined || cmd === null) return true;
  if (typeof cmd !== 'string') return true;
  const trimmed = cmd.trim();
  return FORBIDDEN_VALIDATION_PATTERNS.some((re) => re.test(trimmed));
}

function loadOrchestration() {
  const raw = fs.readFileSync(ORCHESTRATION_PATH, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`✗ orchestration.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.units)) {
    console.error('✗ orchestration.json missing top-level "units" array');
    process.exit(1);
  }
  return parsed;
}

export function validateUnit(u) {
  const failures = [];

  if (typeof u.id !== 'string' || u.id.length === 0) {
    failures.push({ code: 'MISSING_ID', message: 'unit lacks string id' });
    return failures;
  }

  if (u.priority === undefined || u.priority === null) {
    failures.push({ id: u.id, code: 'MISSING_PRIORITY', message: 'priority is required (1..5)' });
  } else if (!Number.isInteger(u.priority) || u.priority < PRIORITY_MIN || u.priority > PRIORITY_MAX) {
    failures.push({
      id: u.id,
      code: 'BAD_PRIORITY',
      message: `priority must be integer in [${PRIORITY_MIN}..${PRIORITY_MAX}], got ${JSON.stringify(u.priority)}`,
    });
  }

  if (u.sprint === undefined || u.sprint === null) {
    failures.push({ id: u.id, code: 'MISSING_SPRINT', message: 'sprint is required (0..6)' });
  } else if (!Number.isInteger(u.sprint) || u.sprint < SPRINT_MIN || u.sprint > SPRINT_MAX) {
    failures.push({
      id: u.id,
      code: 'BAD_SPRINT',
      message: `sprint must be integer in [${SPRINT_MIN}..${SPRINT_MAX}], got ${JSON.stringify(u.sprint)}`,
    });
  }

  if (typeof u.cluster !== 'string' || u.cluster.trim().length === 0) {
    failures.push({ id: u.id, code: 'MISSING_CLUSTER', message: 'cluster is required (non-empty string)' });
  }

  if (typeof u.approval !== 'string' || u.approval.length === 0) {
    failures.push({ id: u.id, code: 'MISSING_APPROVAL', message: 'approval is required (proposed|approved|denied|needs-grilling)' });
  } else if (!APPROVAL_VALUES.has(u.approval)) {
    failures.push({
      id: u.id,
      code: 'BAD_APPROVAL',
      message: `approval must be one of [${Array.from(APPROVAL_VALUES).join('|')}], got ${JSON.stringify(u.approval)}`,
    });
  }

  if (typeof u.status === 'string' && !STATUS_VALUES.has(u.status)) {
    failures.push({
      id: u.id,
      code: 'BAD_STATUS',
      severity: 'warn',
      message: `status must be one of [${Array.from(STATUS_VALUES).join('|')}], got ${JSON.stringify(u.status)} — legacy values tolerated; will promote to hard-fail after burndown unit drains them`,
    });
  }

  if (u.status === 'claimed') {
    if (typeof u.claimedBy !== 'string' || u.claimedBy.trim().length === 0) {
      failures.push({
        id: u.id,
        code: 'MISSING_CLAIMED_BY',
        message: 'status=claimed requires claimedBy (non-empty string identifying the agent/session)',
      });
    }
    if (typeof u.claimedAt !== 'string' || Number.isNaN(Date.parse(u.claimedAt))) {
      failures.push({
        id: u.id,
        code: 'BAD_CLAIMED_AT',
        message: 'status=claimed requires claimedAt (ISO 8601 timestamp parseable by Date.parse)',
      });
    }
  } else if (u.claimedBy !== undefined || u.claimedAt !== undefined) {
    if (u.status !== 'done') {
      failures.push({
        id: u.id,
        code: 'ORPHAN_CLAIM_FIELDS',
        message: `claimedBy/claimedAt set but status is ${JSON.stringify(u.status)} (expected 'claimed' or 'done'). Either transition status or clear the claim fields.`,
      });
    }
  }

  return failures;
}

/**
 * Validate validationCmd for strict mode.
 * Only applied to units with status='approved' (ready to be claimed).
 * Units with 'verificationNotes' field are given a TODO pass (not hard-fail).
 */
export function validateUnitStrictValidation(u) {
  // Only enforce on approved units (the ones about to be dispatched).
  if (u.status !== 'approved') return [];

  const failures = [];

  if (isTrivialValidationCmd(u.validationCmd)) {
    // If there's a verificationNotes field, downgrade to warn (agent left a TODO)
    const severity = u.verificationNotes ? 'warn' : undefined;
    failures.push({
      id: u.id,
      code: 'TRIVIAL_VALIDATION_CMD',
      severity,
      message: `validationCmd is missing or trivial: ${JSON.stringify(u.validationCmd ?? '')}${u.verificationNotes ? ' [verificationNotes TODO: ' + u.verificationNotes + ']' : ' — add a real check or set verificationNotes for a TODO'}`,
    });
  }

  return failures;
}

function main() {
  const orch = loadOrchestration();
  const units = orch.units;

  const targets = units.filter((u) => u && u.status !== 'done' && u.status !== 'denied');
  const failures = [];

  for (const u of targets) {
    failures.push(...validateUnit(u));
  }

  // Strict-validation mode: additionally check validationCmd on approved units.
  const strictViolators = [];
  if (STRICT_VALIDATION) {
    for (const u of targets) {
      strictViolators.push(...validateUnitStrictValidation(u));
    }
  }

  if (VERBOSE) {
    console.log(`Validated ${targets.length} active unit(s) of ${units.length} total.`);
    if (STRICT_VALIDATION) {
      const approvedCount = targets.filter((u) => u.status === 'approved').length;
      console.log(`Strict-validation: checked validationCmd on ${approvedCount} approved unit(s).`);
    }
  }

  const hardFailures = failures.filter((f) => f.severity !== 'warn');
  const softWarnings = failures.filter((f) => f.severity === 'warn');

  for (const w of softWarnings) {
    const tag = w.id ? `${w.id}: ` : '';
    console.warn(`⚠ ${tag}[${w.code}] ${w.message}`);
  }
  if (softWarnings.length > 0) {
    console.warn(`(${softWarnings.length} legacy schema warning(s) — non-blocking until burndown unit lands.)`);
  }

  if (hardFailures.length === 0 && (strictViolators.length === 0 || !STRICT_VALIDATION)) {
    console.log(`OK — orchestration schema valid (${targets.length} active unit(s) checked)`);
    if (STRICT_VALIDATION) {
      const approvedCount = targets.filter((u) => u.status === 'approved').length;
      const hardStrictViolators = strictViolators.filter((f) => f.severity !== 'warn');
      const warnStrictViolators = strictViolators.filter((f) => f.severity === 'warn');
      if (warnStrictViolators.length > 0) {
        for (const w of warnStrictViolators) {
          console.warn(`⚠ ${w.id}: [${w.code}] ${w.message}`);
        }
        console.warn(`(${warnStrictViolators.length} approved unit(s) have verificationNotes TODOs — tighten before claiming.)`);
      }
      if (hardStrictViolators.length === 0) {
        console.log(`OK — strict-validation passed (${approvedCount} approved unit(s) have valid validationCmd)`);
        process.exit(0);
      }
    } else {
      process.exit(0);
    }
  }

  // Print schema failures
  const label = SOFT ? '⚠ ' : '✗ ';
  for (const f of hardFailures) {
    const tag = f.id ? `${f.id}: ` : '';
    console[SOFT ? 'warn' : 'error'](`${label}${tag}[${f.code}] ${f.message}`);
  }
  if (hardFailures.length > 0) {
    console[SOFT ? 'warn' : 'error'](`\n${hardFailures.length} schema violation(s) across ${targets.length} active unit(s).`);
  }

  // Print strict-validation failures
  if (STRICT_VALIDATION && strictViolators.length > 0) {
    const hardStrictViolators = strictViolators.filter((f) => f.severity !== 'warn');
    const warnStrictViolators = strictViolators.filter((f) => f.severity === 'warn');

    for (const w of warnStrictViolators) {
      console.warn(`⚠ ${w.id}: [${w.code}] ${w.message}`);
    }
    if (warnStrictViolators.length > 0) {
      console.warn(`(${warnStrictViolators.length} approved unit(s) have verificationNotes TODOs — tighten before claiming.)`);
    }

    for (const f of hardStrictViolators) {
      console.error(`✗ ${f.id}: [${f.code}] ${f.message}`);
    }
    if (hardStrictViolators.length > 0) {
      console.error(`\n${hardStrictViolators.length} approved unit(s) missing real validationCmd (--strict-validation).`);
      console.error('Fix: add a validationCmd that would catch the unit not being done.');
      console.error('Or add a verificationNotes field with a TODO to downgrade to warn.');
    }
  }

  if (SOFT) {
    console.warn('(--soft mode: exiting 0. Drop --soft once existing violations are fixed — see 11a-1 STOP CONDITION.)');
    process.exit(0);
  }

  // Determine exit code
  const hardStrictViolators = STRICT_VALIDATION
    ? strictViolators.filter((f) => f.severity !== 'warn')
    : [];

  if (hardFailures.length > 0 || hardStrictViolators.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
