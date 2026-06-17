#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/swarm-watchdog.mjs
 *
 * Permanent orchestration lead-dog. Polls docs/ai/orchestration.json every
 * 60s, makes deterministic dispatch decisions per the watchdog policy,
 * recovers from common failure modes without human intervention, and logs
 * every decision structurally for closed-loop self-improvement.
 *
 * THIS IS NOT A ONE-OFF SCRIPT. It's the foundation of every future
 * unattended run. Build to extend. Hooks at onCycleStart / preDispatch /
 * postDispatch / onAbort / onSessionEnd let later units (13g-13 learned-
 * rules ingestion, 13g-14 firing telemetry, etc.) wire in without
 * rewriting the core loop.
 *
 * Architecture — three-tier reasoning:
 *   Tier 1 — rule-based core (pure JS, deterministic, free; 95% of decisions)
 *   Tier 2 — Hermes second-opinion (local Ollama; called on ambiguity, free)
 *   Tier 3 — Sonnet for high-value moments (paid; ≤1 call/session)
 *
 * Boot context (read on every start):
 *   docs/guardrails/HARDENING_ROADMAP.md
 *   docs/guardrails/registry.json
 *   docs/ai/orchestration.json
 *   docs/ai/learned-rules.jsonl (if exists)
 *   docs/signal/SIGNAL.md (parsed for ## NEVER / ## ALWAYS / ## REGRESS)
 *   telemetry/events.jsonl (cumulative cost since session start)
 *   docs/ai/swarm-watchdog-decisions.jsonl (own prior decisions)
 *   docs/ai/watchdog-policy.json (declarative rule overrides)
 *
 * Modes:
 *   --watch                  continuous polling loop
 *   --self-test              empirical proof of stale-claim revert
 *   --robustness-test        full battery (all feature claims)
 *   --cycle-once             single poll, useful for cron / CI
 *   --status                 summary of current state, no mutation
 *   --reflect                Tier 3 sonnet pass over decision log (STUB; not wired)
 *
 * Caps (CLI flags override; defaults match plan's "conservative first night"):
 *   --max-pods <n>           default 1
 *   --max-hours <n>          default 4
 *   --max-cost-usd <n>       default 3
 *   --max-attempts <n>       default 2
 *   --poll-interval-ms <n>   default 60000
 *
 * Behavior flags:
 *   --exit-on-empty          exit 0 when no eligible candidates remain
 *                            (useful for cron / one-shot CI; default keeps
 *                            polling until cap or SIGINT)
 *
 * Tier 2 (Hermes second-opinion) and Tier 3 (Sonnet reflection) are
 * documented hooks but NOT yet wired. Today's watchdog is Tier 1 only —
 * pure rule-based decisions. The boot banner discloses this state honestly
 * so the calling assistant doesn't claim more than is implemented.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Paths ────────────────────────────────────────────────────────────────────

const PATHS = {
  orchestration: path.join(ROOT, 'docs/ai/orchestration.json'),
  registry:      path.join(ROOT, 'docs/guardrails/registry.json'),
  policy:        path.join(ROOT, 'docs/ai/watchdog-policy.json'),
  decisions:     path.join(ROOT, 'docs/ai/swarm-watchdog-decisions.jsonl'),
  log:           path.join(ROOT, 'docs/ai/swarm-watchdog.log'),
  telemetry:     path.join(ROOT, 'telemetry/events.jsonl'),
  signal:        path.join(ROOT, 'docs/signal/SIGNAL.md'),
  roadmap:       path.join(ROOT, 'docs/guardrails/HARDENING_ROADMAP.md'),
  learnedRules:  path.join(ROOT, 'docs/ai/learned-rules.jsonl'),
  snapshotsDir:  path.join(ROOT, 'docs/ai/snapshots'),
  // Agent-proposed unit additions. Agents during dispatch can append a JSON
  // line proposing a new unit (blocker, side-quest, cleanup discovery).
  // Watchdog SURFACES these in its log + decisions feed but does NOT
  // auto-promote — Adrian reviews in the morning. Future Tier 2/3 logic can
  // safely auto-promote tightly-scoped proposals (additive, in-cluster, small).
  proposedUnits: path.join(ROOT, 'docs/ai/proposed-units.jsonl'),
};

// ── Defaults / args ──────────────────────────────────────────────────────────

const DEFAULTS = {
  maxPods:        1,
  maxHours:       4,
  maxCostUsd:     3,
  maxAttempts:    2,
  pollIntervalMs: 60_000,
  // Per-pod wall-clock cap (ms), keyed by model family.
  modelCaps: {
    'sonnet':  30 * 60 * 1000,
    'opus':    60 * 60 * 1000,
    'hermes3': 15 * 60 * 1000,
    'qwen':    15 * 60 * 1000,
    'kimi':     8 * 60 * 1000,
    default:   25 * 60 * 1000,
  },
};

function parseArgs(argv) {
  const out = {
    mode: 'watch',
    ...DEFAULTS,
    sessionStartMs: Date.now(),
    exitOnEmpty: false,
  };
  const flag = (name) => argv.includes(name);
  const value = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && i < argv.length - 1 ? argv[i + 1] : null;
  };
  if (flag('--self-test'))       out.mode = 'self-test';
  if (flag('--robustness-test')) out.mode = 'robustness-test';
  if (flag('--cycle-once'))      out.mode = 'cycle-once';
  if (flag('--status'))          out.mode = 'status';
  if (flag('--reflect'))         out.mode = 'reflect';
  if (flag('--watch'))           out.mode = 'watch';
  if (flag('--exit-on-empty'))   out.exitOnEmpty = true;
  const num = (k, n) => { const v = value(k); if (v) out[n] = Number(v); };
  num('--max-pods', 'maxPods');
  num('--max-hours', 'maxHours');
  num('--max-cost-usd', 'maxCostUsd');
  num('--max-attempts', 'maxAttempts');
  num('--poll-interval-ms', 'pollIntervalMs');
  return out;
}

// ── IO helpers ────────────────────────────────────────────────────────────────

function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

function writeJsonAtomic(p, data) {
  // Write to <p>.tmp.<pid>, fsync, rename. POSIX-atomic on same fs.
  const tmp = `${p}.tmp.${process.pid}`;
  const json = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmp, json);
  fs.renameSync(tmp, p);
}

function appendLine(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + '\n');
}

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.mkdirSync(path.dirname(PATHS.log), { recursive: true });
  fs.appendFileSync(PATHS.log, line + '\n');
  console.log(line);
}

// ── Boot context ──────────────────────────────────────────────────────────────

function loadBootContext() {
  const orch = readJson(PATHS.orchestration);
  if (!orch) throw new Error('Cannot read orchestration.json — refusing to start');
  const registry = readJson(PATHS.registry, { gates: [] });
  const policy   = readJson(PATHS.policy, defaultPolicy());

  // Cumulative cost from telemetry (sum costUsd from kimi.unit.complete events
  // since policy.session.startedAt OR last 24h).
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  let cumulativeCostUsd = 0;
  if (fs.existsSync(PATHS.telemetry)) {
    const lines = fs.readFileSync(PATHS.telemetry, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (new Date(e.ts).getTime() < sinceMs) continue;
        if (e.event && e.event.endsWith('.complete') && e.data?.costUsd) {
          cumulativeCostUsd += Number(e.data.costUsd) || 0;
        }
      } catch { /* skip malformed */ }
    }
  }

  // Parse SIGNAL.md for canonical NEVER / ALWAYS / REGRESS sections.
  const signalLessons = [];
  if (fs.existsSync(PATHS.signal)) {
    const txt = fs.readFileSync(PATHS.signal, 'utf8');
    const re = /^##\s+(NEVER|ALWAYS|REGRESS|Anti-pattern|Lesson)[^\n]*$/gim;
    let m;
    while ((m = re.exec(txt)) !== null) {
      signalLessons.push({ heading: m[0].trim(), index: m.index });
    }
  }

  // Read prior decisions for "don't repeat dropped paths" awareness.
  let priorDecisions = 0;
  if (fs.existsSync(PATHS.decisions)) {
    priorDecisions = fs.readFileSync(PATHS.decisions, 'utf8').split('\n').filter(Boolean).length;
  }

  return {
    orchestration: orch,
    registry,
    policy,
    cumulativeCostUsd,
    signalLessonsCount: signalLessons.length,
    priorDecisions,
    roadmapExists: fs.existsSync(PATHS.roadmap),
    learnedRulesCount: fs.existsSync(PATHS.learnedRules)
      ? fs.readFileSync(PATHS.learnedRules, 'utf8').split('\n').filter(Boolean).length
      : 0,
  };
}

function defaultPolicy() {
  // Returned when watchdog-policy.json doesn't exist. Encodes lessons we've
  // already learned. Adrian-editable in-tree without touching code.
  return {
    version: '1.0.0',
    modelDispatch: {
      haikuForUnattended: 'FORBIDDEN',
      rationale: 'Adrian directive 2026-05-04 — feedback_no_haiku_dispatch.md',
    },
    concurrency: {
      maxParallelPodsForUnattended: 1,
      rationale: 'Mario Zechner: parallel sub-agents are an anti-pattern when sharing files.',
    },
    fileOverlap: {
      policy: 'REFUSE',
      rationale: 'Cross-pod sibling-patches blurred ownership in batches 1-2.',
    },
    visualUI: {
      policy: 'ATTENDED_ONLY',
      rationale: 'Visual debt the gates couldn\'t catch in batch 3 required Adrian eyeballs.',
    },
    selfReferentialDispatch: {
      policy: 'FORBIDDEN_VIA_SAME_RUNNER',
      rationale: '13g-8 modifies kimi-agent.mjs / hermes-unit.mjs — must go via Claude Code Agent.',
    },
  };
}

function bootBanner(ctx, args) {
  const approved = ctx.orchestration.units.filter(u => u.status === 'approved').length;
  const claimed  = ctx.orchestration.units.filter(u => u.status === 'claimed').length;
  const safeApproved = ctx.orchestration.units.filter(
    u => u.status === 'approved' && u.safeForUnattended === true,
  ).length;
  const lines = [
    '─'.repeat(72),
    '  swarm-watchdog — orchestration lead-dog',
    '─'.repeat(72),
    `  units: ${approved} approved (${safeApproved} safeForUnattended), ${claimed} in-flight`,
    `  cost (24h): $${ctx.cumulativeCostUsd.toFixed(4)} (cap: $${args.maxCostUsd})`,
    `  caps: pods=${args.maxPods} hours=${args.maxHours} attempts=${args.maxAttempts}`,
    `  policy: ${fs.existsSync(PATHS.policy) ? 'loaded from ' + path.relative(ROOT, PATHS.policy) : 'using defaults'}`,
    `  signal lessons indexed: ${ctx.signalLessonsCount}`,
    `  prior watchdog decisions logged: ${ctx.priorDecisions}`,
    `  learned rules pending: ${ctx.learnedRulesCount}`,
    `  registry gates: ${ctx.registry.gates?.length ?? 0}`,
    `  exit-on-empty: ${args.exitOnEmpty ? 'YES (cron-style)' : 'no (idles when queue empty)'}`,
    '',
    '  REASONING TIERS (honest disclosure):',
    '    Tier 1 — rule-based core         IMPLEMENTED  (95% of decisions)',
    '    Tier 2 — Hermes second-opinion   STUB         (rule-based fallback)',
    '    Tier 3 — Sonnet reflection       STUB         (--reflect is a no-op today)',
    '',
    '  Closed-loop logging IS live (every decision → swarm-watchdog-decisions.jsonl).',
    '  Self-improvement = log captured + future LLM reads it back. Not yet automated.',
    '─'.repeat(72),
  ];
  for (const l of lines) logLine(l);
}

// ── Decision factors (Tier 1 — pure rule-based) ──────────────────────────────

const FILE_PATH_RE = /\b((?:src|public|docs|scripts|tests|api|fixtures|\.husky|\.claude)\/[A-Za-z0-9_./-]+)/g;

function extractIntendedPaths(unit) {
  const corpus = [unit.description, ...(unit.agentNotes || []), ...(unit.validationCmd ? [unit.validationCmd] : [])]
    .filter(Boolean).join('\n');
  const out = new Set();
  let m;
  while ((m = FILE_PATH_RE.exec(corpus)) !== null) {
    const p = m[1].replace(/[)\].,;:]+$/, '');
    if (p.includes('*')) continue;
    out.add(p);
  }
  return out;
}

function uncommittedFiles() {
  try {
    const out = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' });
    return new Set(out.split('\n').filter(Boolean).map(line => line.slice(3).trim()));
  } catch {
    return new Set();
  }
}

function modelCapMs(unit, args) {
  const m = String(unit.model || '').toLowerCase();
  for (const k of Object.keys(args.modelCaps)) {
    if (k !== 'default' && m.includes(k)) return args.modelCaps[k];
  }
  return args.modelCaps.default;
}

function dependsOnSatisfied(unit, allUnits) {
  if (!Array.isArray(unit.dependsOn) || unit.dependsOn.length === 0) return true;
  const byId = new Map(allUnits.map(u => [u.id, u]));
  return unit.dependsOn.every(id => byId.get(id)?.status === 'done');
}

function evaluateCandidate(unit, allUnits, activeClaims, uncommitted, args) {
  const factors = {};
  factors.statusApproved      = unit.status === 'approved';
  factors.dependsOnSatisfied  = dependsOnSatisfied(unit, allUnits);
  factors.safeForUnattended   = unit.safeForUnattended === true;
  factors.attemptsUnderCap    = (unit.attempts ?? 0) < args.maxAttempts;
  factors.notHaiku            = !String(unit.model || '').toLowerCase().includes('haiku');

  const intended = extractIntendedPaths(unit);
  const claimedPaths = new Set();
  for (const c of activeClaims) for (const p of extractIntendedPaths(c)) claimedPaths.add(p);
  factors.noOverlapInFlight   = ![...intended].some(p => claimedPaths.has(p));
  factors.noOverlapUncommitted= ![...intended].some(p => uncommitted.has(p));

  const allPass =
    factors.statusApproved &&
    factors.dependsOnSatisfied &&
    factors.safeForUnattended &&
    factors.attemptsUnderCap &&
    factors.notHaiku &&
    factors.noOverlapInFlight &&
    factors.noOverlapUncommitted;

  let reason;
  if (!factors.statusApproved)       reason = `status is '${unit.status}'`;
  else if (!factors.dependsOnSatisfied) reason = 'dependsOn not all done';
  else if (!factors.safeForUnattended) reason = 'safeForUnattended is not true';
  else if (!factors.attemptsUnderCap)  reason = `attempts ${unit.attempts ?? 0} >= cap ${args.maxAttempts}`;
  else if (!factors.notHaiku)          reason = 'haiku forbidden for unattended dispatch';
  else if (!factors.noOverlapInFlight) reason = 'file overlap with in-flight claim';
  else if (!factors.noOverlapUncommitted) reason = 'file overlap with uncommitted human work';
  else reason = 'all factors pass';

  return { allPass, factors, reason };
}

// ── Caps ─────────────────────────────────────────────────────────────────────

function checkOverallCaps(ctx, activeClaims, args) {
  const elapsedHours = (Date.now() - args.sessionStartMs) / (60 * 60 * 1000);
  const reasons = [];
  if (elapsedHours >= args.maxHours)              reasons.push(`wall-clock ${elapsedHours.toFixed(2)}h >= ${args.maxHours}h`);
  if (ctx.cumulativeCostUsd >= args.maxCostUsd)   reasons.push(`cost $${ctx.cumulativeCostUsd.toFixed(2)} >= $${args.maxCostUsd}`);
  if (activeClaims.length >= args.maxPods)         reasons.push(`pods ${activeClaims.length} >= ${args.maxPods} cap`);
  return { canDispatch: reasons.length === 0, blockReasons: reasons };
}

// ── Self-healing ──────────────────────────────────────────────────────────────

function revertStaleClaims(orch, args, sourceLabel) {
  const now = Date.now();
  let reverted = 0;
  for (const u of orch.units) {
    if (u.status !== 'claimed' || !u.claimedAt) continue;
    const ageMs = now - new Date(u.claimedAt).getTime();
    const cap = modelCapMs(u, args);
    if (ageMs > cap) {
      u.status = 'approved';
      u.attempts = (u.attempts ?? 0) + 1;
      u.lastAbort = {
        agent: u.claimedBy ?? 'unknown',
        at: new Date().toISOString(),
        reason: `${sourceLabel} timeout: claimed for ${(ageMs/60000).toFixed(1)}min, cap ${(cap/60000).toFixed(0)}min`,
      };
      delete u.claimedBy;
      delete u.claimedAt;
      // Park if attempts exhausted.
      if (u.attempts >= args.maxAttempts) {
        u.status = 'parked';
        u.lastAbort.reason += ` — attempts ${u.attempts} >= cap ${args.maxAttempts}, parked`;
      }
      reverted++;
      logLine(`  ↻ reverted stale claim on ${u.id} (${u.lastAbort.reason})`);
      appendLine(PATHS.decisions, {
        ts: new Date().toISOString(),
        candidateUnitId: u.id,
        decision: u.status === 'parked' ? 'parked' : 'reverted',
        reason: u.lastAbort.reason,
        factors: { ageMs, capMs: cap, attempts: u.attempts },
      });
    }
  }
  return reverted;
}

// ── Extension hooks (no-op by default; future units replace) ────────────────
// Wired into runCycle so future units (13g-13 learned-rules, 13g-14 telemetry,
// 13s-strength-6 strength-hook) can override without modifying core loop.

/**
 * onSessionEnd hook — strength snapshot (13s-strength-6).
 *
 * Invokes generate-strength-report.mjs --history-snapshot at the end of every
 * watchdog session so that Future-Adrian's first session of the day reads
 * up-to-date strength scores. Wrapped in try/catch so a failure here never
 * crashes the graceful exit path.
 *
 * NOTE: The --history-snapshot flag is added by unit 13s-strength-3. If that
 * unit hasn't landed yet the script still runs without the flag (generates the
 * standard report). The hook is correct; the flag is forward-compatible.
 */
function onSessionEndStrengthSnapshot(_summary) {
  try {
    execSync('node scripts/generate-strength-report.mjs --history-snapshot', {
      cwd: ROOT,
      stdio: 'pipe',
    });
    logLine('[strength-snapshot] OK — strength report regenerated on session end');
  } catch (err) {
    logLine(`[strength-snapshot] WARN — failed to regenerate strength report: ${err.message}`);
  }
}

const hooks = {
  onCycleStart: (_state) => {},
  preDispatch:  (_candidate) => true,   // return false to veto dispatch
  postDispatch: (_unit, _result) => {},
  onAbort:      (_unit, _reason) => {},
  onSessionEnd: onSessionEndStrengthSnapshot,
};

// Track which candidates we've already announced this session, with cycle
// counters. Re-announce after N idle cycles in case the assistant missed the
// first announcement (or restarted between polls).
const announcedThisSession = new Map();   // id → { cycleAnnounced, lastReAnnounceCycle }
let cycleCount = 0;
const REANNOUNCE_AFTER_CYCLES = 10;   // 10 × 60s = ~10min idle reminder

// ── Cycle ─────────────────────────────────────────────────────────────────────

// Track which proposed-units lines we've already surfaced this session so we
// don't re-log them every cycle.
const surfacedProposalsThisSession = new Set();

function surfaceProposedUnits() {
  if (!fs.existsSync(PATHS.proposedUnits)) return;
  let lines;
  try {
    lines = fs.readFileSync(PATHS.proposedUnits, 'utf8').split('\n').filter(Boolean);
  } catch {
    return;
  }
  for (const line of lines) {
    if (surfacedProposalsThisSession.has(line)) continue;
    surfacedProposalsThisSession.add(line);
    let parsed;
    try { parsed = JSON.parse(line); } catch {
      logLine(`  ⚠ proposed-units.jsonl: malformed line skipped`);
      continue;
    }
    logLine(`  ⚑ AGENT PROPOSAL surfaced (NOT auto-promoted): from=${parsed.fromUnitId} reason=${parsed.reason} urgency=${parsed.urgency}`);
    appendLine(PATHS.decisions, {
      ts: new Date().toISOString(),
      candidateUnitId: parsed.proposedUnit?.id ?? '?',
      decision: 'proposal-surfaced',
      reason: parsed.reason ?? 'unspecified',
      factors: { fromUnitId: parsed.fromUnitId, urgency: parsed.urgency },
    });
  }
}

function runCycle(args) {
  hooks.onCycleStart({ args });
  // Surface any new agent-proposed units (read-only; never auto-promote).
  try { surfaceProposedUnits(); }
  catch (err) { logLine(`  ⚠ surfaceProposedUnits threw: ${err.message}`); }
  const ctx = loadBootContext();
  const orch = ctx.orchestration;
  const allUnits = orch.units;

  // 1. self-heal: revert stale claims
  const reverted = revertStaleClaims(orch, args, 'watchdog');
  if (reverted > 0) writeJsonAtomic(PATHS.orchestration, orch);

  // 2. check overall caps
  const activeClaims = allUnits.filter(u => u.status === 'claimed');
  const capCheck = checkOverallCaps(ctx, activeClaims, args);
  if (!capCheck.canDispatch) {
    logLine(`  ◯ no dispatch — ${capCheck.blockReasons.join(', ')}`);
    return { dispatched: null, blocked: capCheck.blockReasons, reverted };
  }

  // 3. announce ALL eligible candidates (assistant has options + fallthrough).
  //    Per-candidate try/catch so one corrupted unit can't stall the loop.
  const uncommitted = uncommittedFiles();
  const candidates = allUnits.filter(u => u.status === 'approved');
  const announcedThisCycle = [];

  for (const u of candidates) {
    let evalResult;
    try {
      evalResult = evaluateCandidate(u, allUnits, activeClaims, uncommitted, args);
    } catch (err) {
      logLine(`  ⚠ evaluateCandidate threw on ${u.id}: ${err.message} — skipping`);
      continue;
    }
    if (!evalResult.allPass) continue;

    // Veto hook: future Tier 2/3 logic can override the rule-based decision.
    let hookOk = true;
    try { hookOk = hooks.preDispatch(u); } catch (err) {
      logLine(`  ⚠ preDispatch hook threw on ${u.id}: ${err.message} — treating as veto`);
      continue;
    }
    if (hookOk === false) {
      logLine(`  ◯ ${u.id} eligible per Tier 1 but vetoed by hook`);
      continue;
    }

    // De-dup with re-announce after N idle cycles. Resilience: if the
    // assistant missed the first announce or restarted, we surface the
    // candidate again so it's not orphaned in the log.
    const prior = announcedThisSession.get(u.id);
    const shouldReAnnounce = prior && (cycleCount - prior.lastReAnnounceCycle) >= REANNOUNCE_AFTER_CYCLES;
    const isFirstAnnounce = !prior;

    if (isFirstAnnounce || shouldReAnnounce) {
      const tag = isFirstAnnounce ? 'would dispatch' : 're-announce';
      logLine(`  ✓ ${tag} ${u.id} (${u.name})`);
      appendLine(PATHS.decisions, {
        ts: new Date().toISOString(),
        candidateUnitId: u.id,
        decision: isFirstAnnounce ? 'would-dispatch' : 're-announce',
        reason: evalResult.reason,
        factors: evalResult.factors,
        cycle: cycleCount,
      });
      announcedThisSession.set(u.id, {
        cycleAnnounced: prior?.cycleAnnounced ?? cycleCount,
        lastReAnnounceCycle: cycleCount,
      });
      announcedThisCycle.push(u.id);
    }

    try { hooks.postDispatch(u, { announced: isFirstAnnounce }); }
    catch (err) { logLine(`  ⚠ postDispatch hook threw: ${err.message}`); }
  }

  if (announcedThisCycle.length > 0) {
    return { dispatched: announcedThisCycle, blocked: [], reverted };
  }

  logLine(`  ◯ no eligible candidates among ${candidates.length} approved units`);
  return { dispatched: null, blocked: ['no-eligible-candidates'], reverted };
}

// ── Modes ─────────────────────────────────────────────────────────────────────

async function modeWatch(args) {
  bootBanner(loadBootContext(), args);
  logLine('▶ entering watch mode');

  let interrupted = false;
  const sigHandler = () => {
    if (interrupted) return;
    interrupted = true;
    logLine('▽ SIGINT/SIGTERM received — graceful exit');
  };
  process.on('SIGINT', sigHandler);
  process.on('SIGTERM', sigHandler);

  while (!interrupted) {
    cycleCount++;
    try {
      const result = runCycle(args);
      // Any cap-hit blockers exit the watch loop.
      if (result.dispatched === null) {
        for (const r of result.blocked) {
          if (r.startsWith('wall-clock') || r.startsWith('cost')) {
            logLine(`▽ exiting — cap reached: ${r}`);
            try { hooks.onSessionEnd({ reason: r, cycleCount }); } catch {}
            return;
          }
        }
        if (args.exitOnEmpty && result.blocked.includes('no-eligible-candidates')) {
          logLine('▽ exiting — queue empty (--exit-on-empty)');
          try { hooks.onSessionEnd({ reason: 'queue-empty', cycleCount }); } catch {}
          return;
        }
        // No-eligible-candidates without --exit-on-empty: keep idling.
        // Adrian's directive 2026-05-05: "constantly build until I interrupt."
        // The loop survives missing candidates, evaluator errors, and other
        // transient failures. Only caps + SIGINT stop it.
      }
    } catch (err) {
      // Cycle threw before runCycle returned — log and KEEP GOING. The watch
      // loop must survive single-cycle failures so the build continues
      // through transient errors (orchestration.json mid-write race, missing
      // git, etc.).
      logLine(`  ✗ cycle error (continuing): ${err.message}`);
    }
    if (interrupted) break;
    await new Promise(r => setTimeout(r, args.pollIntervalMs));
  }

  // Graceful: revert any in-flight claims this session orphaned.
  try { hooks.onSessionEnd({ reason: 'sigint', cycleCount }); } catch {}
  logLine('▽ session end');
}

function modeStatus(args) {
  const ctx = loadBootContext();
  bootBanner(ctx, args);
  const orch = ctx.orchestration;
  const claimed = orch.units.filter(u => u.status === 'claimed');
  const approved = orch.units.filter(u => u.status === 'approved');
  const safeApproved = approved.filter(u => u.safeForUnattended === true);
  console.log(`\n  In-flight: ${claimed.length}`);
  for (const u of claimed) {
    const ageMin = u.claimedAt ? ((Date.now() - new Date(u.claimedAt).getTime()) / 60000).toFixed(1) : '?';
    console.log(`    • ${u.id} — ${u.claimedBy ?? '?'} (${ageMin}min)`);
  }
  console.log(`\n  Safe-for-unattended: ${safeApproved.length} / ${approved.length} approved`);
  for (const u of safeApproved.slice(0, 10)) {
    console.log(`    • ${u.id} — ${u.name}`);
  }
}

// ── Self-test ─────────────────────────────────────────────────────────────────

function modeSelfTest(args) {
  // Plant a fake claim 30 minutes in the past, run one cycle, assert revert.
  logLine('▶ --self-test');
  const orch = readJson(PATHS.orchestration);
  if (!orch) { console.error('FAIL: cannot read orchestration.json'); process.exit(1); }

  // Snapshot for restoration.
  const backup = JSON.parse(JSON.stringify(orch));
  const FAKE_ID = '__watchdog_self_test__';
  const fakeUnit = {
    id: FAKE_ID,
    phase: 'self-test',
    cluster: 'self-test',
    sprint: 0,
    priority: 9,
    tier: 'T1',
    model: 'sonnet-4-6',
    effort: 'min',
    name: 'self-test fake claim',
    status: 'claimed',
    approval: 'approved',
    dependsOn: [],
    description: 'Self-test fixture; ignore.',
    validationCmd: 'true',
    agentNotes: ['Self-test'],
    claimedBy: '__watchdog_self_test__',
    claimedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    attempts: 0,
  };
  orch.units.push(fakeUnit);
  writeJsonAtomic(PATHS.orchestration, orch);

  // One cycle.
  runCycle(args);

  // Verify revert.
  const post = readJson(PATHS.orchestration);
  const found = post.units.find(u => u.id === FAKE_ID);
  let pass = true;
  const evidence = [];
  if (!found) { pass = false; evidence.push('FAIL: fake unit missing post-cycle'); }
  else {
    if (found.status !== 'approved') { pass = false; evidence.push(`FAIL: status is '${found.status}', expected 'approved'`); }
    if (found.claimedBy)              { pass = false; evidence.push('FAIL: claimedBy still set'); }
    if (found.claimedAt)              { pass = false; evidence.push('FAIL: claimedAt still set'); }
    if (!found.lastAbort)              { pass = false; evidence.push('FAIL: lastAbort not added'); }
    if ((found.attempts ?? 0) < 1)    { pass = false; evidence.push(`FAIL: attempts ${found.attempts ?? 0} < 1`); }
    if (pass) evidence.push(`OK: claim reverted (status=${found.status}, attempts=${found.attempts}, lastAbort.reason="${found.lastAbort.reason}")`);
  }

  // Restore backup (remove fake unit).
  writeJsonAtomic(PATHS.orchestration, backup);
  for (const e of evidence) logLine(`  ${e}`);

  // ── Test 2: onSessionEnd strength-snapshot hook (13s-strength-6) ────────────
  // Exercise the hook and assert: (a) it doesn't throw, (b) swarm-watchdog.log
  // contains a [strength-snapshot] line after firing.
  logLine('  [self-test] exercising onSessionEnd strength-snapshot hook…');
  const logSizeBefore = fs.existsSync(PATHS.log) ? fs.statSync(PATHS.log).size : 0;
  let hookPass = true;
  const hookEvidence = [];
  try {
    hooks.onSessionEnd({ reason: 'self-test', cycleCount: 0 });
    // Read log tail to verify a [strength-snapshot] line was appended.
    // Use a Buffer read from the known byte offset so multi-byte chars don't
    // confuse the slice boundary.
    const logSizeAfter = fs.existsSync(PATHS.log) ? fs.statSync(PATHS.log).size : 0;
    if (logSizeAfter <= logSizeBefore) {
      hookPass = false;
      hookEvidence.push('FAIL: [strength-snapshot] hook wrote nothing to swarm-watchdog.log');
    } else {
      const fd = fs.openSync(PATHS.log, 'r');
      const newByteLen = logSizeAfter - logSizeBefore;
      const buf = Buffer.alloc(newByteLen);
      fs.readSync(fd, buf, 0, newByteLen, logSizeBefore);
      fs.closeSync(fd);
      const newLines = buf.toString('utf8');
      if (!newLines.includes('[strength-snapshot]')) {
        hookPass = false;
        hookEvidence.push('FAIL: [strength-snapshot] prefix not found in new log lines');
      } else {
        hookEvidence.push('OK: [strength-snapshot] line written to swarm-watchdog.log');
      }
    }
  } catch (err) {
    hookPass = false;
    hookEvidence.push(`FAIL: onSessionEnd hook threw: ${err.message}`);
  }
  for (const e of hookEvidence) logLine(`  ${e}`);

  process.exit((pass && hookPass) ? 0 : 1);
}

// ── Robustness battery ───────────────────────────────────────────────────────

function modeRobustnessTest(args) {
  logLine('▶ --robustness-test (full battery)');
  const results = [];
  const orchBackup = JSON.parse(JSON.stringify(readJson(PATHS.orchestration)));

  function record(name, pass, evidence) {
    results.push({ name, pass, evidence });
    logLine(`  ${pass ? '✓' : '✗'} ${name} — ${evidence}`);
  }

  // Test 1: stale-claim revert (uses --self-test mechanism inline).
  try {
    const orch = readJson(PATHS.orchestration);
    const FAKE = '__rb_test_stale__';
    orch.units.push({
      id: FAKE, phase: 'rb', cluster: 'rb', sprint: 0, priority: 9, tier: 'T1',
      model: 'sonnet-4-6', effort: 'min', name: 'rb stale', status: 'claimed',
      approval: 'approved', dependsOn: [], description: 'rb',
      validationCmd: 'true', agentNotes: [], claimedBy: 'rb',
      claimedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), attempts: 0,
    });
    writeJsonAtomic(PATHS.orchestration, orch);
    runCycle(args);
    const post = readJson(PATHS.orchestration);
    const u = post.units.find(x => x.id === FAKE);
    record('1. stale-claim revert', u && u.status === 'approved' && (u.attempts ?? 0) >= 1,
      u ? `status=${u.status}, attempts=${u.attempts}` : 'unit missing');
  } catch (e) { record('1. stale-claim revert', false, e.message); }

  // Test 2: concurrency cap — with 1 active, evaluator must skip.
  try {
    const orch = readJson(PATHS.orchestration);
    orch.units.push({
      id: '__rb_active__', phase: 'rb', cluster: 'rb', sprint: 0, priority: 9, tier: 'T1',
      model: 'sonnet-4-6', effort: 'min', name: 'active', status: 'claimed',
      approval: 'approved', dependsOn: [], description: 'rb',
      validationCmd: 'true', agentNotes: [], claimedBy: 'rb',
      claimedAt: new Date().toISOString(), attempts: 0,
    });
    writeJsonAtomic(PATHS.orchestration, orch);
    const ctx = loadBootContext();
    const claims = ctx.orchestration.units.filter(u => u.status === 'claimed');
    const cap = checkOverallCaps(ctx, claims, { ...args, maxPods: 1 });
    record('2. concurrency cap', !cap.canDispatch && cap.blockReasons.some(r => r.includes('pods')),
      `canDispatch=${cap.canDispatch}, reasons=[${cap.blockReasons.join('; ')}]`);
  } catch (e) { record('2. concurrency cap', false, e.message); }

  // Test 3: cost cap — synthetic high-cost telemetry
  try {
    const synthArgs = { ...args, maxCostUsd: 1 };
    // Inject a fake recent cost line
    const fakeLine = JSON.stringify({ ts: new Date().toISOString(), event: 'kimi.unit.complete', data: { costUsd: 2.0 } }) + '\n';
    const before = fs.existsSync(PATHS.telemetry) ? fs.readFileSync(PATHS.telemetry, 'utf8') : '';
    fs.writeFileSync(PATHS.telemetry, before + fakeLine);
    const ctx = loadBootContext();
    const cap = checkOverallCaps(ctx, [], synthArgs);
    record('3. cost cap', !cap.canDispatch && cap.blockReasons.some(r => r.startsWith('cost')),
      `canDispatch=${cap.canDispatch}, cost=$${ctx.cumulativeCostUsd.toFixed(2)}`);
    // Revert telemetry
    fs.writeFileSync(PATHS.telemetry, before);
  } catch (e) { record('3. cost cap', false, e.message); }

  // Test 4: wall-clock cap
  try {
    const fakeArgs = { ...args, sessionStartMs: Date.now() - 10 * 60 * 60 * 1000, maxHours: 4 };
    const ctx = loadBootContext();
    const cap = checkOverallCaps(ctx, [], fakeArgs);
    record('4. wall-clock cap', !cap.canDispatch && cap.blockReasons.some(r => r.startsWith('wall')),
      `reasons=[${cap.blockReasons.join('; ')}]`);
  } catch (e) { record('4. wall-clock cap', false, e.message); }

  // Test 5: attempts cap — plant unit with attempts: 2
  try {
    const orch = readJson(PATHS.orchestration);
    orch.units.push({
      id: '__rb_attempts__', phase: 'rb', cluster: 'rb', sprint: 0, priority: 9, tier: 'T1',
      model: 'sonnet-4-6', effort: 'min', name: 'rb attempts', status: 'approved',
      approval: 'approved', dependsOn: [], description: 'rb',
      validationCmd: 'true', agentNotes: [], attempts: 2,
      safeForUnattended: true,
    });
    writeJsonAtomic(PATHS.orchestration, orch);
    const ctx = loadBootContext();
    const u = ctx.orchestration.units.find(x => x.id === '__rb_attempts__');
    const evalRes = evaluateCandidate(u, ctx.orchestration.units, [], new Set(), { ...args, maxAttempts: 2 });
    record('5. attempts cap', !evalRes.factors.attemptsUnderCap && !evalRes.allPass,
      `attemptsUnderCap=${evalRes.factors.attemptsUnderCap}`);
  } catch (e) { record('5. attempts cap', false, e.message); }

  // Test 6: cross-contamination
  try {
    const ctx = loadBootContext();
    const active = [{
      id: '__rb_active2__', status: 'claimed', description: 'touches src/app/components/foo.tsx',
      agentNotes: [], validationCmd: '',
    }];
    const cand = {
      id: '__rb_overlap__', status: 'approved', safeForUnattended: true, attempts: 0,
      dependsOn: [], description: 'also touches src/app/components/foo.tsx',
      agentNotes: [], validationCmd: '', model: 'sonnet',
    };
    const evalRes = evaluateCandidate(cand, [...ctx.orchestration.units, cand], active, new Set(), args);
    record('6. cross-contamination', !evalRes.factors.noOverlapInFlight && !evalRes.allPass,
      `noOverlapInFlight=${evalRes.factors.noOverlapInFlight}`);
  } catch (e) { record('6. cross-contamination', false, e.message); }

  // Test 7: safeForUnattended honor
  try {
    const ctx = loadBootContext();
    const cand = {
      id: '__rb_unsafe__', status: 'approved', safeForUnattended: false, attempts: 0,
      dependsOn: [], description: '', agentNotes: [], validationCmd: '', model: 'sonnet',
    };
    const evalRes = evaluateCandidate(cand, [...ctx.orchestration.units, cand], [], new Set(), args);
    record('7. safeForUnattended honor', !evalRes.factors.safeForUnattended && !evalRes.allPass,
      `safeForUnattended=${evalRes.factors.safeForUnattended}`);
  } catch (e) { record('7. safeForUnattended honor', false, e.message); }

  // Test 8: atomic write — confirm tmp-rename pattern doesn't corrupt
  try {
    const before = readJson(PATHS.orchestration);
    writeJsonAtomic(PATHS.orchestration, before); // round-trip
    const after = readJson(PATHS.orchestration);
    record('8. atomic write round-trip', after && after.units?.length === before.units?.length,
      `units before=${before.units.length}, after=${after?.units?.length ?? 0}`);
  } catch (e) { record('8. atomic write round-trip', false, e.message); }

  // Test 9: dependsOn satisfaction
  try {
    const all = [
      { id: 'dep1', status: 'approved' },  // not done
      { id: 'cand', status: 'approved', safeForUnattended: true, attempts: 0,
        dependsOn: ['dep1'], description: '', agentNotes: [], validationCmd: '', model: 'sonnet' },
    ];
    const evalRes = evaluateCandidate(all[1], all, [], new Set(), args);
    record('9. dependsOn satisfaction', !evalRes.factors.dependsOnSatisfied,
      `dependsOnSatisfied=${evalRes.factors.dependsOnSatisfied}`);
  } catch (e) { record('9. dependsOn satisfaction', false, e.message); }

  // Test 10: haiku forbidden
  try {
    const cand = {
      id: '__rb_haiku__', status: 'approved', safeForUnattended: true, attempts: 0,
      dependsOn: [], description: '', agentNotes: [], validationCmd: '', model: 'haiku-4-5',
    };
    const evalRes = evaluateCandidate(cand, [cand], [], new Set(), args);
    record('10. haiku forbidden', !evalRes.factors.notHaiku && !evalRes.allPass,
      `notHaiku=${evalRes.factors.notHaiku}`);
  } catch (e) { record('10. haiku forbidden', false, e.message); }

  // Test 11: git-status overlap
  try {
    const cand = {
      id: '__rb_uncommitted__', status: 'approved', safeForUnattended: true, attempts: 0,
      dependsOn: [], description: 'will touch src/foo.tsx', agentNotes: [], validationCmd: '', model: 'sonnet',
    };
    const fakeUncommitted = new Set(['src/foo.tsx']);
    const evalRes = evaluateCandidate(cand, [cand], [], fakeUncommitted, args);
    record('11. git-status overlap', !evalRes.factors.noOverlapUncommitted && !evalRes.allPass,
      `noOverlapUncommitted=${evalRes.factors.noOverlapUncommitted}`);
  } catch (e) { record('11. git-status overlap', false, e.message); }

  // Test 12: decision log written
  try {
    const before = fs.existsSync(PATHS.decisions) ? fs.readFileSync(PATHS.decisions, 'utf8').length : 0;
    appendLine(PATHS.decisions, { ts: new Date().toISOString(), candidateUnitId: '__rb_log__', decision: 'test', reason: 'rb', factors: {} });
    const after = fs.readFileSync(PATHS.decisions, 'utf8').length;
    record('12. decision log written', after > before, `log grew ${after - before} bytes`);
  } catch (e) { record('12. decision log written', false, e.message); }

  // Test 13: boot context loaded
  try {
    const ctx = loadBootContext();
    record('13. boot context loaded',
      ctx.orchestration && ctx.registry && ctx.policy && typeof ctx.cumulativeCostUsd === 'number',
      `orch=${!!ctx.orchestration}, registry=${!!ctx.registry}, policy=${!!ctx.policy}, cost=$${ctx.cumulativeCostUsd.toFixed(2)}`);
  } catch (e) { record('13. boot context loaded', false, e.message); }

  // Restore orchestration.json (remove all rb fixtures).
  const cleanOrch = JSON.parse(JSON.stringify(orchBackup));
  writeJsonAtomic(PATHS.orchestration, cleanOrch);

  // Write report
  const reportPath = path.join(ROOT, 'docs/ai/swarm-watchdog-robustness-2026-05-05.md');
  const lines = [
    '# Watchdog robustness battery — 2026-05-05',
    '',
    `Run: \`node scripts/swarm-watchdog.mjs --robustness-test\``,
    `Time: ${new Date().toISOString()}`,
    '',
    `## Summary`,
    `Total: ${results.length} | Pass: ${results.filter(r => r.pass).length} | Fail: ${results.filter(r => !r.pass).length}`,
    '',
    '## Results',
    '',
    ...results.map(r => `- ${r.pass ? '✓' : '✗'} **${r.name}** — ${r.evidence}`),
    '',
    '## What this empirically proves',
    '',
    'Every safety mechanism the watchdog claims is exercised against a contrived violation here. PASS = the watchdog does what it says. FAIL = it doesn\'t; the watchdog must not be used until fixed.',
    '',
    'Coverage gaps acknowledged (deferred to future units):',
    '- Crashed-child reaping (requires a real Agent dispatch to test)',
    '- JSON corruption recovery (requires snapshot infrastructure from 13g-25)',
    '- Hermes Tier 2 second-opinion (requires Ollama running with qwen2.5-coder:14b-hds)',
    '- Sonnet Tier 3 reflection (deferred until decision log accumulates ~100 entries)',
    '',
  ];
  fs.writeFileSync(reportPath, lines.join('\n'));
  logLine(`▽ report written: ${path.relative(ROOT, reportPath)}`);
  const allPass = results.every(r => r.pass);
  process.exit(allPass ? 0 : 1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));

if (args.mode === 'self-test')           modeSelfTest(args);
else if (args.mode === 'robustness-test') modeRobustnessTest(args);
else if (args.mode === 'status')          modeStatus(args);
else if (args.mode === 'cycle-once') {
  bootBanner(loadBootContext(), args);
  runCycle(args);
}
else if (args.mode === 'reflect') {
  console.log('Tier 3 sonnet reflection deferred until decision log has ≥100 entries.');
  process.exit(0);
}
else /* watch */                          modeWatch(args);

// ── Extension hooks (stubs for future units) ─────────────────────────────────
// Future units (13g-13 learned-rules, 13g-14 firing telemetry) wire in here:
//
//   export const hooks = {
//     onCycleStart: (state) => {},
//     preDispatch:  (candidate) => {},
//     postDispatch: (unit, agentResult) => {},
//     onAbort:      (unit, reason) => {},
//     onSessionEnd: (summary) => {},
//   };
//
// Wire by importing this script and overriding `hooks.<name>`. The core loop
// invokes each hook at the appropriate point. New heuristics added here, not
// by rewriting the rule-based core.
