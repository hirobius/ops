/** @internal — not part of @hirobius/design-system public API surface. */
import fs from 'fs';
import { spawn } from 'child_process';

const MANIFEST_PATH = 'public/hds-manifest.json';
const ORCH_PATH = 'docs/ai/orchestration.json';
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'hds-coder';

// ── Mode detection ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isOrchestrate = args.includes('--orchestrate');
const isDryRun = args.includes('--dry-run');
const command = args.filter(a => !a.startsWith('--')).join(' ').trim();

// ── Tokens mode (original behavior — do NOT regress) ─────────────────────────
async function runTokensMode() {
  if (!command) {
    console.error('❌ Please provide a command. Example: npm run hds:bot "Rename blue-500 to brand-blue"');
    process.exit(1);
  }

  console.log(`\n🤖 [AI ORCHESTRATOR] Processing command: "${command}"...`);

  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

    // Pass a slimmed-down context to the LLM to save processing power
    const primitiveContext = manifest.tokens.primitive.map(t => ({ name: t.name, value: t.value }));

    const prompt = `
      You are a strictly JSON-only deterministic routing agent.
      Do not output markdown, explanations, or conversational text.
      Output ONLY a JSON array of action objects.

      Available Actions:
      - "RENAME_TOKEN": Requires "targetName" (current name) and "newName".
      - "UPDATE_VALUE": Requires "targetName" and "newValue".

      Current Tokens (Context):
      ${JSON.stringify(primitiveContext)}

      User Command: ${command}
    `;

    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: prompt, stream: false }),
    });

    const data = await response.json();

    // Strip markdown formatting if the LLM disobeys the "no markdown" rule
    const cleanJsonStr = data.response.replace(/```json/g, '').replace(/```/g, '').trim();
    const actions = JSON.parse(cleanJsonStr);

    console.log('✅ [AI INTENT PARSED] Executing changes:');
    console.log(actions);

    // Apply the deterministic changes safely
    let modified = false;
    actions.forEach(action => {
      const tokenIndex = manifest.tokens.primitive.findIndex(t => t.name === action.targetName);
      if (tokenIndex > -1) {
        if (action.action === 'RENAME_TOKEN' && action.newName) {
          manifest.tokens.primitive[tokenIndex].name = action.newName;
          // Update the path as well to keep the DTCG architecture intact
          const pathParts = manifest.tokens.primitive[tokenIndex].path.split('.');
          pathParts[pathParts.length - 1] = action.newName;
          manifest.tokens.primitive[tokenIndex].path = pathParts.join('.');
          modified = true;
        }
        if (action.action === 'UPDATE_VALUE' && action.newValue) {
          manifest.tokens.primitive[tokenIndex].value = action.newValue;
          modified = true;
        }
      }
    });

    if (modified) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      console.log(`\n💾 [FILE SYSTEM] hds-manifest.json updated safely.`);
    } else {
      console.log(`\n⚠️ [NO CHANGES] Could not match target tokens in the manifest.`);
    }
  } catch (err) {
    console.error('\n❌ [SYSTEM ERROR]', err.message);
  }
}

// ── Orchestrate mode (new) ────────────────────────────────────────────────────

function loadOrch() {
  return JSON.parse(fs.readFileSync(ORCH_PATH, 'utf-8'));
}

function saveOrch(orch) {
  fs.writeFileSync(ORCH_PATH, JSON.stringify(orch, null, 2));
}

function findEligibleUnits(orch) {
  const byId = Object.fromEntries(orch.units.map(u => [u.id, u]));
  return orch.units.filter(u => {
    if (u.status !== 'pending') return false;
    if (u.phase === 'backlog') return false;
    return (u.dependsOn || []).every(dep => byId[dep]?.status === 'done');
  });
}

function spawnCmd(cmd) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn('sh', ['-c', cmd], { cwd: process.cwd() });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', exitCode => resolve({ exitCode, stdout, stderr, duration: Date.now() - start }));
  });
}

function checkRetryExhaustion() {
  const logPath = 'telemetry/events.jsonl';
  if (!fs.existsSync(logPath)) return null;
  const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean);
  const all = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  // Rolling 24h window: stale fixture-driven events age out, so a real signal
  // can emerge from current activity instead of being permanently masked.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = all.filter(e => e.ts && Date.parse(e.ts) >= cutoff);
  // Only count real enabled pipeline runs. The `source: 'pipeline'` tag is
  // applied by production callers (generate-to-figma); fixture/dev-script
  // runs lack it and are excluded.
  const starts = recent.filter(e =>
    e.event === 'retry.start' &&
    e.data?.enabled === true &&
    e.data?.source === 'pipeline'
  ).slice(-20);
  if (starts.length < 10) return null; // Not enough production data
  const window = recent.filter(e => e.event === 'retry.exhausted' &&
    e.ts >= starts[0].ts && e.ts <= starts[starts.length - 1].ts);
  if (window.length / starts.length > 0.1) {
    return `retry-exhaustion rate ${(window.length / starts.length * 100).toFixed(0)}% (${window.length}/${starts.length}) exceeds 10% threshold`;
  }
  return null;
}

async function runOrchestrate() {
  const { log } = await import('../telemetry/logger.mjs');

  const orch = loadOrch();
  const eligible = findEligibleUnits(orch);

  console.log(`\n🔍 Found ${eligible.length} eligible unit(s):`);
  if (eligible.length === 0) {
    console.log('ℹ️  No eligible units to run — all pending units have unmet dependencies.');
    return;
  }
  for (const u of eligible) {
    console.log(`  • [${u.id}] ${u.name}${u.validationCmd ? '' : '  (no validationCmd — delegate-to-coder)'}`);
  }

  if (isDryRun) {
    console.log('\n📋 Dry-run: no commands executed.');
    return;
  }

  // Stop condition: check retry-exhaustion before executing anything
  // Only real enabled=true retry.start events count toward the threshold.
  const exhaustionMsg = checkRetryExhaustion();
  if (exhaustionMsg) {
    console.error(`\n🛑 STOP: ${exhaustionMsg}. Human triage required.`);
    process.exit(1);
  }

  let prevErrorSig = null;

  for (const unit of eligible) {
    if (!unit.validationCmd) {
      console.log(`\n⏭️  [${unit.id}] No validationCmd — emit delegate-to-coder`);
      await log('orchestrator.delegate', { unitId: unit.id, name: unit.name, phase: unit.phase });
      continue;
    }

    console.log(`\n▶  [${unit.id}] ${unit.validationCmd}`);
    const result = await spawnCmd(unit.validationCmd);

    await log('orchestrator.run', {
      unitId: unit.id,
      name: unit.name,
      exitCode: result.exitCode,
      stdout: result.stdout.slice(0, 500),
      stderr: result.stderr.slice(0, 500),
      duration: result.duration,
    });

    if (result.exitCode === 0) {
      // Reload before mutating to avoid stale-read overwrites
      const fresh = loadOrch();
      const target = fresh.units.find(u => u.id === unit.id);
      target.status = 'done';
      target.completedAt = new Date().toISOString().slice(0, 10);
      saveOrch(fresh);
      console.log(`✅ [${unit.id}] PASSED (${result.duration}ms) — marked done`);
      prevErrorSig = null;
    } else {
      const errSig = (result.stderr || result.stdout).slice(0, 200);
      await log('orchestrator.fail', {
        unitId: unit.id,
        name: unit.name,
        exitCode: result.exitCode,
        stderr: result.stderr.slice(0, 500),
      });
      console.error(`❌ [${unit.id}] FAILED (exit ${result.exitCode})`);
      if (result.stderr) console.error(result.stderr.slice(0, 400));
      if (result.stdout) console.log(result.stdout.slice(0, 400));

      // Stop condition: two consecutive failures with different error messages
      if (prevErrorSig !== null && prevErrorSig !== errSig) {
        console.error('\n🛑 STOP: Two consecutive failures with different errors. Human triage required.');
        process.exit(1);
      }
      prevErrorSig = errSig;
      break; // Halt the run on first failure; do not attempt remaining units
    }
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
if (isOrchestrate) {
  runOrchestrate().catch(err => {
    console.error('❌ [ORCHESTRATOR ERROR]', err.message);
    process.exit(1);
  });
} else {
  run();
}

// Preserve original entry point name used by tests / callers
async function run() {
  await runTokensMode();
}
