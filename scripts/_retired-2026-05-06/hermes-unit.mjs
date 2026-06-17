#!/usr/bin/env node
/** @internal */
/**
 * scripts/hermes-unit.mjs
 *
 * Thin wrapper that bridges our orchestration.json claim/done protocol
 * to a Hermes agent session. Hermes handles the tool loop, skill learning,
 * and self-improvement; we handle claim, model routing, and mark_done.
 *
 * Usage:
 *   node scripts/hermes-unit.mjs --unit <id>
 *   node scripts/hermes-unit.mjs --loop
 *   node scripts/hermes-unit.mjs --dry-run
 *
 * Model routing (matches orchestration-watcher tiers):
 *   T1 → hermes3:latest via local Ollama (free)
 *   T2 → kimi-k2.6 via Moonshot
 *   T3 → kimi-k2.6 via Moonshot
 *   T4 → skipped (requires Claude agent dispatch)
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { logPodRun } from '../telemetry/pod-runs.mjs';
import { appendAuditEntry } from '../docs/security/audit-logger.mjs';
import { persistLearnedRule } from './persist-learned-rule.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH_PATH = path.join(ROOT, 'docs/ai/orchestration.json');
const QUEUE_PATH = path.join(ROOT, 'docs/ai/ready-queue.json');
const HERMES = path.join(process.env.HOME, '.local/bin/hermes');
const AGENT_ID = 'hermes-agent';

// Auto-load .env.local
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const LOOP = argv.includes('--loop');
const unitIdx = argv.indexOf('--unit');
const UNIT_ID = unitIdx !== -1 ? argv[unitIdx + 1] : null;

// ── Model routing ─────────────────────────────────────────────────────────────

function modelForTier(tier) {
  switch (tier) {
    case 'T1':
      return { model: 'hermes3:latest', provider: 'local-ollama' };
    case 'T2':
      return { model: 'qwen2.5-coder:14b-hds', provider: 'local-ollama' }; // free local
    case 'T3':
      return { model: 'qwen2.5-coder:14b-hds', provider: 'local-ollama' }; // free local
    default:
      return null; // T4 → skip (Claude only)
  }
}

// ── Orchestration helpers ─────────────────────────────────────────────────────

function loadOrch() {
  return JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8'));
}
function saveOrch(d) {
  fs.writeFileSync(ORCH_PATH, JSON.stringify(d, null, 2));
}

function findEligible(unitId, skipIds = []) {
  const data = loadOrch();
  const doneSet = new Set(
    data.units.filter((u) => ['done', 'denied'].includes(u.status)).map((u) => u.id),
  );
  const skipSet = new Set(skipIds);

  if (unitId) return data.units.find((u) => u.id === unitId) || null;

  if (fs.existsSync(QUEUE_PATH)) {
    const q = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const age = Date.now() - Date.parse(q.generatedAt);
    if (age < 10 * 60 * 1000 && q.eligible?.length > 0) {
      const top = q.eligible.find(
        (e) => e.status === 'approved' && !e.hitl && e.tier !== 'T4' && !skipSet.has(e.id),
      );
      if (top) return data.units.find((u) => u.id === top.id);
    }
  }

  return (
    data.units
      .filter(
        (u) =>
          u.status === 'approved' &&
          !u.hitl &&
          u.tier !== 'T4' &&
          !skipSet.has(u.id) &&
          (u.dependsOn || []).every((d) => doneSet.has(d)),
      )
      .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0] || null
  );
}

function claimUnit(unit) {
  const data = loadOrch();
  const u = data.units.find((x) => x.id === unit.id);
  if (!u || u.status !== 'approved') throw new Error(`CLAIM_RACE: ${unit.id} is ${u?.status}`);
  u.status = 'claimed';
  u.claimedBy = AGENT_ID;
  u.claimedAt = new Date().toISOString();
  saveOrch(data);
  execSync(
    `git add docs/ai/orchestration.json && git commit --no-verify -m "chore(orch): claim ${unit.id} for ${AGENT_ID}"`,
    { cwd: ROOT, stdio: 'inherit' },
  );
  console.log(`[hermes-unit] Claimed ${unit.id}`);
}

function revertClaim(unitId, note) {
  const data = loadOrch();
  const u = data.units.find((x) => x.id === unitId);
  if (u && u.status === 'claimed') {
    u.status = 'approved';
    delete u.claimedBy;
    delete u.claimedAt;
    if (note)
      u.agentNotes = Array.isArray(u.agentNotes)
        ? [...u.agentNotes, note]
        : [u.agentNotes, note].filter(Boolean);
    saveOrch(data);
  }
}

// ── Post-mortem distillation (fire-and-forget, never throws) ─────────────────

async function runPostMortem(unit, abortReason) {
  try {
    const descSnippet = (unit.description || '').slice(0, 300);
    const prompt = [
      `Unit ${unit.id} failed. Description: ${descSnippet}`,
      `Abort reason: ${abortReason}`,
      'Output ONLY valid JSON with these fields:',
      '{ "rule": "<imperative-verb one-sentence rule>", "rationale": "<one sentence>", "applies_to": "all"|"T1"|"T2" }',
    ].join('\n');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let response;
    try {
      response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes3',
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.warn(`[hermes-unit] post-mortem: Ollama returned ${response.status}`);
      return;
    }

    const data = await response.json();
    const raw = data?.message?.content || '';

    // Extract JSON — model may wrap it in markdown fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[hermes-unit] post-mortem: no JSON in Ollama response');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.warn('[hermes-unit] post-mortem: JSON parse failed');
      return;
    }

    const { rule, rationale, applies_to } = parsed;
    if (!rule || !rationale) {
      console.warn('[hermes-unit] post-mortem: rule or rationale missing');
      return;
    }

    // ── Append to AGENT_GUIDELINES.md ────────────────────────────────────────
    const guidelinesPath = path.join(ROOT, 'docs/ai/AGENT_GUIDELINES.md');
    const dateStr = new Date().toISOString().slice(0, 10);
    const entry = `- [auto] ${rule} (unit: ${unit.id}, ${dateStr}) — ${rationale}\n`;

    let guidelines = fs.readFileSync(guidelinesPath, 'utf8');
    const SECTION = '## Auto-Learned Rules';
    if (guidelines.includes(SECTION)) {
      guidelines = guidelines.replace(
        new RegExp(`(${SECTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)(\n##|$)`),
        (match, section, after) => section + entry + after,
      );
    } else {
      guidelines = guidelines.trimEnd() + `\n\n---\n\n${SECTION}\n\n${entry}`;
    }
    fs.writeFileSync(guidelinesPath, guidelines, 'utf8');

    // ── Append telemetry event ────────────────────────────────────────────────
    const telemetryPath = path.join(ROOT, 'telemetry/events.jsonl');
    const event = JSON.stringify({
      event: 'post_mortem',
      unitId: unit.id,
      rule,
      rationale,
      applies_to: applies_to || 'all',
      ts: new Date().toISOString(),
    });
    fs.appendFileSync(telemetryPath, event + '\n', 'utf8');

    // ── Persist to learned-rules.jsonl (per unit 13g-13) ─────────────────────
    // Closed-loop seam: every distilled rule lands in the canonical
    // append-only log scripts/promote-learned-rule.mjs walks. The promotion
    // step (turning it into a real registry entry) stays HITL by design.
    persistLearnedRule({
      rule,
      rationale,
      applies_to: applies_to || 'all',
      source: 'hermes-distillation',
      evidence_unit_id: unit.id,
    });

    console.log(`[hermes-unit] post-mortem: learned rule for ${unit.id}: ${rule}`);
  } catch (e) {
    // fire-and-forget — never propagate
    console.warn(`[hermes-unit] post-mortem: suppressed error: ${e?.message}`);
  }
}

function markDone(unitId) {
  const data = loadOrch();
  const u = data.units.find((x) => x.id === unitId);
  if (!u) return;

  // 13g-8: audit-batch-deliverables gates mark-done. Voluntary self-audit
  // becomes mandatory. On failure: status stays 'claimed', audit output
  // captured into lastAbort for the next attempt's prompt (Boris's
  // verification-iteration pattern).
  try {
    execSync(`node scripts/audit-batch-deliverables.mjs --pre-mark-done --units ${unitId}`, {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  } catch (auditErr) {
    const out =
      (auditErr.stderr ? String(auditErr.stderr) : '') +
      (auditErr.stdout ? String(auditErr.stdout) : '');
    u.lastAbort = {
      agent: 'hermes-agent',
      at: new Date().toISOString(),
      reason: 'audit-batch-deliverables failed pre-mark-done',
      validationOutput: out.slice(0, 2000),
    };
    u.attempts = (u.attempts ?? 0) + 1;
    saveOrch(data);
    console.error(
      `[hermes-unit] markDone refused: audit-batch-deliverables exited non-zero. ` +
        `Output captured in lastAbort. Preview: ${out.slice(0, 400)}`,
    );
    throw new Error('mark_done refused by audit gate');
  }

  // Audit passed — proceed with status flip.
  u.status = 'done';
  u.completedAt = new Date().toISOString().slice(0, 10);
  try {
    u.completedCommit = execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {}
  saveOrch(data);
  execSync(
    `git add docs/ai/orchestration.json && git commit --no-verify -m "chore(orch): mark ${unitId} done [hermes-agent]"`,
    { cwd: ROOT, stdio: 'inherit' },
  );
}

// ── Tier helper (read from ready-queue if available) ──────────────────────────

function tierFor(unit) {
  if (fs.existsSync(QUEUE_PATH)) {
    const q = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const e = q.eligible?.find((x) => x.id === unit.id);
    if (e?.tier) return e.tier;
  }
  // Fallback: re-derive from watcher heuristics inline
  const T1_RE =
    /\b(scrub|regen|baseline|fixture|emoji|comment|move|rename|alias|tag|cron|burndown)\b/i;
  const T4_RE = /\b(brand|multi-tenant|deploy|public api|business|monetiz|pricing|stripe)\b/i;
  const T3_RE = /\b(schema|protocol|validator|projection|batch|cross-cutting|refactor|manifest)\b/i;
  if (unit.status === 'needs-grilling') return 'T4';
  const text = `${unit.name || ''} ${unit.description || ''} ${unit.cluster || ''}`;
  if (T4_RE.test(text)) return 'T4';
  if (T1_RE.test(text)) return 'T1';
  if (T3_RE.test(text)) return 'T3';
  return 'T2';
}

// ── Prompt builder ────────────────────────────────────────────────────────────

const DESC_CAP = 800;
const NOTES_CAP = 2000; // raised from 400 — abort history must reach Hermes

function cap(text, limit) {
  if (!text) return '';
  const s = Array.isArray(text) ? text.map(String).join('\n') : String(text);
  return s.length > limit ? s.slice(0, limit) + ' …[truncated]' : s;
}

// Show the most recent N notes so latest abort guidance isn't buried under old ones
function recentNotes(notes, keep = 6) {
  if (!notes) return '';
  const arr = Array.isArray(notes) ? notes : [notes];
  const recent = arr.slice(-keep).map(String).join('\n');
  const omitted = arr.length - keep;
  return omitted > 0 ? `[${omitted} older notes omitted]\n${recent}` : recent;
}

// Count prior aborts in persisted agentNotes — used for auto-escalation
function priorAbortCount(unit) {
  const notes = Array.isArray(unit.agentNotes)
    ? unit.agentNotes
    : [unit.agentNotes].filter(Boolean);
  return notes.filter((n) => /abort/i.test(String(n))).length;
}

function buildPrompt(unit) {
  const notes = recentNotes(unit.agentNotes);
  return `You are executing build unit "${unit.id}" in the Hirobius Design System repo at ${ROOT}.

BRANCH: fix/ui-pipeline (already checked out)
STACK: Next.js 15, React 19, TypeScript, pnpm. No new npm dependencies.

UNIT:
ID: ${unit.id}
Title: ${unit.title || unit.id}
Description: ${cap(unit.description, DESC_CAP) || '(see agentNotes)'}
${notes ? `Notes (most recent first):\n${cap(notes, NOTES_CAP)}` : ''}
Validation: ${unit.validationCmd || 'node scripts/validate-manifest.mjs && node scripts/check-manifest-drift.mjs'}

RULES:
1. Read files before editing. Do NOT survey the repo broadly — read only the files you need to write.
2. Run the validationCmd after changes. Fix failures before committing.
3. If validationCmd or a pre-commit gate fails on a file you did NOT modify, fix that file's violation first before retrying.
4. Commit: "feat(<scope>): ${unit.id} <one-liner>" with "Co-Authored-By: Hermes <noreply@nousresearch.com>"
5. Never git push, never pnpm check:release, never rm -rf (except node_modules).
6. Use --no-verify on commits (pre-commit hooks check whole codebase; validationCmd is your quality gate).
7. If blocked after 3 attempts, stop and write "BLOCKER: <reason>".

Begin now.`;
}

// ── Run a unit via Hermes ─────────────────────────────────────────────────────

function runUnit(unit) {
  const tier = tierFor(unit);
  const modelCfg = modelForTier(tier);

  if (!modelCfg) {
    console.log(`[hermes-unit] Skipping T4 unit ${unit.id} — requires Claude dispatch`);
    return { ok: false, reason: 'T4 unit — requires Claude dispatch' };
  }

  const prompt = buildPrompt(unit);
  console.log(`\n[hermes-unit] ${unit.id} | tier=${tier} | model=${modelCfg.model}`);

  // Write prompt to temp file to avoid shell quoting issues
  const tmpPrompt = path.join(ROOT, '.hermes-prompt.tmp');
  fs.writeFileSync(tmpPrompt, prompt, 'utf8');

  const hermesArgs = [
    'chat',
    '-q',
    prompt,
    '-Q',
    '--yolo',
    '--max-turns',
    '40',
    '-m',
    modelCfg.model,
  ];
  if (modelCfg.provider) hermesArgs.push('--provider', modelCfg.provider);

  const podStart = Date.now();
  const result = spawnSync(HERMES, hermesArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    timeout: 20 * 60 * 1000, // 20min per unit
  });
  const podDurationMs = Date.now() - podStart;

  try {
    fs.unlinkSync(tmpPrompt);
  } catch {}

  if (result.status !== 0) {
    console.error(`[hermes-unit] Hermes exited ${result.status} for ${unit.id}`);
    logPodRun({
      sessionId: `hermes:${unit.id}`,
      model: modelCfg.model,
      totalTokens: 0, // Ollama does not expose token counts via CLI
      durationMs: podDurationMs,
      unitsCompleted: 0,
      notes: `hermes exited ${result.status}`,
    });
    appendAuditEntry({
      unit_id: unit.id,
      agent_id: AGENT_ID,
      files_written: [], // subprocess — not interceptable at this level
      commands_run: [],
      commit_hash: null,
      outcome: 'failed',
    });
    return {
      ok: false,
      reason: `hermes subprocess exited ${result.status}${result.signal ? ` (signal ${result.signal})` : ''} — model=${modelCfg.model}`,
    };
  }

  // Validate
  const validationCmd =
    unit.validationCmd ||
    'node scripts/validate-manifest.mjs && node scripts/check-manifest-drift.mjs';
  const VALIDATION_TIMEOUT_MS = 5 * 60_000; // bumped from 60s — playwright/typecheck commonly need 2-3min
  try {
    execSync(validationCmd, { cwd: ROOT, stdio: 'pipe', timeout: VALIDATION_TIMEOUT_MS });
    console.log(`[hermes-unit] Validation passed for ${unit.id}`);
    logPodRun({
      sessionId: `hermes:${unit.id}`,
      model: modelCfg.model,
      totalTokens: 0, // Ollama does not expose token counts via CLI
      durationMs: podDurationMs,
      unitsCompleted: 1,
      unitIds: [unit.id],
    });
    // Capture the HEAD commit hash that Hermes made
    let commitHash = null;
    try {
      commitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch {}
    appendAuditEntry({
      unit_id: unit.id,
      agent_id: AGENT_ID,
      files_written: [], // subprocess — not interceptable at this level
      commands_run: [],
      commit_hash: commitHash,
      outcome: 'done',
    });
    return { ok: true };
  } catch (e) {
    const stderr = (e.stderr || '').toString();
    const stdout = (e.stdout || '').toString();
    const exitCode = typeof e.status === 'number' ? e.status : null;
    const timedOut = e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT';
    const tail = extractMeaningfulTail(stderr, stdout, e.message);
    const notes = timedOut
      ? `validation TIMEOUT (${Math.round(VALIDATION_TIMEOUT_MS / 1000)}s) — cmd: \`${validationCmd}\` — last: ${tail.slice(0, 400) || '(no output before kill)'}`
      : tail
        ? `validation failed (exit ${exitCode ?? '?'}): ${tail.slice(0, 600)}`
        : `validation failed (exit ${exitCode ?? '?'}) with no output — cmd: \`${validationCmd}\` (likely a \`test -f\` / \`test -d\` precondition; agent must create the expected file/dir)`;
    console.error(`[hermes-unit] Validation FAILED for ${unit.id}: ${notes.slice(0, 300)}`);
    logPodRun({
      sessionId: `hermes:${unit.id}`,
      model: modelCfg.model,
      totalTokens: 0, // Ollama does not expose token counts via CLI
      durationMs: podDurationMs,
      unitsCompleted: 0,
      notes,
    });
    appendAuditEntry({
      unit_id: unit.id,
      agent_id: AGENT_ID,
      files_written: [],
      commands_run: [],
      commit_hash: null,
      outcome: 'failed',
    });
    return {
      ok: false,
      reason: `validationCmd failed: \`${validationCmd}\` — ${notes}`,
    };
  }
}

// Strip ANSI codes and filter known-noise lines (npm/pnpm warnings, the
// pnpm→npm `verify-deps-before-run` env warning, deprecation notices).
// Prefer lines that look like real errors (FAIL/Error/✖/×); fall back to the
// last 12 non-noise lines so a real diagnostic survives the truncation.
function extractMeaningfulTail(stderr, stdout, fallbackMsg) {
  const ANSI = /\[[0-9;]*m/g;
  const NOISE = [
    /npm warn Unknown env config/i,
    /pnpm warn /i,
    /\bDeprecationWarning:/i,
    /\(Use `node --trace-deprecation/i,
    /^Browserslist: caniuse-lite/i,
    /^npm notice/i,
    /\[WebServer\] $/, // empty webserver lines
  ];
  const ERROR_HINT = /\b(FAIL|Error:|ERROR|✖|×|fail:|TypeError|SyntaxError|exit code [1-9])\b/;

  const raw = (stderr || '') + (stderr && stdout ? '\n' : '') + (stdout || '');
  const cleaned = raw
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0 && !NOISE.some((re) => re.test(l)));

  if (cleaned.length === 0) return (fallbackMsg || '').toString().trim();

  // If there are explicit error lines, anchor the tail around them.
  const errIdx = cleaned.findIndex((l) => ERROR_HINT.test(l));
  const slice =
    errIdx >= 0 ? cleaned.slice(Math.max(0, errIdx - 2), errIdx + 8) : cleaned.slice(-12);

  return slice.join(' | ');
}

// ── Discord notifications ─────────────────────────────────────────────────────

function notify(msg) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    execSync(
      `curl -s -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify({ content: msg }))} "${url}"`,
      { stdio: 'ignore', timeout: 5000 },
    );
  } catch {
    /* non-fatal */
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) {
    const unit = findEligible(UNIT_ID);
    console.log(
      unit
        ? `[hermes-unit] Next: ${unit.id} | tier=${tierFor(unit)} | model=${modelForTier(tierFor(unit))?.model || 'SKIP-T4'}`
        : '[hermes-unit] No eligible units',
    );
    // Seed audit log for dry-run runs
    appendAuditEntry({
      unit_id: unit?.id ?? null,
      agent_id: AGENT_ID,
      files_written: [],
      commands_run: [],
      commit_hash: null,
      outcome: 'dry-run',
    });
    return;
  }

  const SESSION_ABORT_CAP = 2; // skip a unit after this many failures in one session
  const sessionAborts = new Map(); // unitId → abort count this session

  do {
    const unit = findEligible(
      UNIT_ID,
      [...sessionAborts.entries()].filter(([, n]) => n >= SESSION_ABORT_CAP).map(([id]) => id),
    );
    if (!unit) {
      const skipped = [...sessionAborts.entries()]
        .filter(([, n]) => n >= SESSION_ABORT_CAP)
        .map(([id]) => id);
      if (skipped.length) {
        console.log(
          `[hermes-unit] Queue drained. Skipped (${SESSION_ABORT_CAP}+ failures): ${skipped.join(', ')}`,
        );
        notify(
          `✅ Hermes done. Skipped ${skipped.length} unit(s) after ${SESSION_ABORT_CAP} failures: ${skipped.join(', ')} — needs Claude review.`,
        );
      } else {
        console.log('[hermes-unit] Queue empty.');
        const done = JSON.parse(fs.readFileSync(ORCH_PATH, 'utf8')).units.filter(
          (u) => u.status === 'done',
        ).length;
        notify(`✅ Hermes queue empty — ${done} units done total. Ready for Claude review.`);
      }
      break;
    }

    const tier = tierFor(unit);
    if (tier === 'T4') {
      console.log(`[hermes-unit] T4 unit ${unit.id} skipped — Claude only.`);
      sessionAborts.set(unit.id, SESSION_ABORT_CAP); // exclude from this session
      continue;
    }

    // Auto-escalate units with a long history of prior failures
    const PRIOR_ABORT_ESCALATE = 5;
    const priorAborts = priorAbortCount(unit);
    if (priorAborts >= PRIOR_ABORT_ESCALATE) {
      console.warn(
        `[hermes-unit] ${unit.id} has ${priorAborts} prior aborts — escalating to Claude (T4)`,
      );
      notify(
        `⛔ **${unit.id}** escalated to Claude — ${priorAborts} prior aborts in history. Needs human review.`,
      );
      sessionAborts.set(unit.id, SESSION_ABORT_CAP); // mark as skip for this session too
      continue;
    }

    try {
      claimUnit(unit);
    } catch (e) {
      console.log(`[hermes-unit] ${e.message} — retrying`);
      continue;
    }

    const result = runUnit(unit);

    if (result.ok) {
      markDone(unit.id);
      sessionAborts.delete(unit.id);
      console.log(`[hermes-unit] Done: ${unit.id}`);
      notify(`🔨 **${unit.id}** done — ${unit.title || unit.id}`);
    } else {
      const abortReason = `[hermes abort ${new Date().toISOString().slice(0, 10)}]: ${result.reason || 'unknown failure'}`;
      revertClaim(unit.id, abortReason);
      void runPostMortem(unit, abortReason);
      const aborts = (sessionAborts.get(unit.id) || 0) + 1;
      sessionAborts.set(unit.id, aborts);
      console.error(
        `[hermes-unit] Unit ${unit.id} failed (session abort #${aborts}) — claim reverted`,
      );
      if (aborts >= SESSION_ABORT_CAP) {
        console.warn(
          `[hermes-unit] ${unit.id} hit abort cap (${SESSION_ABORT_CAP}) — skipping for this session`,
        );
        notify(
          `⛔ **${unit.id}** skipped after ${SESSION_ABORT_CAP} failures — needs Claude review.`,
        );
      } else {
        notify(
          `⚠️ **${unit.id}** failed (${aborts}/${SESSION_ABORT_CAP}) — claim reverted. Retrying next loop.`,
        );
      }
      if (!LOOP) break;
    }

    if (UNIT_ID) break;
  } while (LOOP);
}

main().catch((e) => {
  console.error('[hermes-unit] Fatal:', e.message);
  process.exit(1);
});
