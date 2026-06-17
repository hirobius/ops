#!/usr/bin/env node
/**
 * scripts/migrate-backlogs-to-hermes.mjs
 *
 * Pushes all task backlogs into Hermes Kanban boards.
 *
 * Boards:
 *   default  — HDS/internal: proposed-units, roadmap, BACKLOG.md
 *   lilac    — Lilac Insure: tasks, goals, checklist
 *   ranch    — The Ranch Foundation: tasks, goals, checklist
 *   prospect — Prospect-001 (Phil): tasks, goals, checklist
 *
 * All tasks use --idempotency-key so re-runs are safe.
 *
 * Usage:
 *   node scripts/migrate-backlogs-to-hermes.mjs              # dry-run
 *   node scripts/migrate-backlogs-to-hermes.mjs --execute    # create tasks
 *   node scripts/migrate-backlogs-to-hermes.mjs --board lilac --execute
 *
 * Hard rules: no push, no .env, no pnpm check:release.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');
const EXECUTE = process.argv.includes('--execute');
const BOARD_FILTER = (() => {
  const i = process.argv.indexOf('--board');
  return i !== -1 ? process.argv[i + 1] : null;
})();

// ── Helpers ───────────────────────────────────────────────────────────────────

function q(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

function readJson(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function readLines(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n');
}

function ikey(s) {
  // Ensure idempotency keys are ≤ 64 chars (safe for the CLI)
  const raw = String(s)
    .replace(/[^a-z0-9_-]/gi, '-')
    .toLowerCase()
    .slice(0, 64);
  return raw;
}

let created = 0,
  skipped = 0,
  failed = 0;
const log = [];

function run(board, title, body, status, idempotencyKey, assignee) {
  const display = `[${board.padEnd(8)}] ${status.padEnd(8)} ${title.slice(0, 70)}`;

  if (!EXECUTE) {
    console.log(`  dry-run  ${display}`);
    log.push({ board, title, status, ikey: idempotencyKey, dry: true });
    skipped++;
    return;
  }

  const boardFlag = `--board ${board}`;
  const iFlag = idempotencyKey ? `--idempotency-key ${q(ikey(idempotencyKey))}` : '';
  const assigneeFlag = assignee ? `--assignee ${q(assignee)}` : '';
  const bodyFlag = body ? `--body ${q(body.slice(0, 4000))}` : '';

  let createOut;
  try {
    createOut = execSync(
      `hermes kanban ${boardFlag} create ${q(title)} --triage --created-by adrian ${bodyFlag} ${iFlag} ${assigneeFlag}`,
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
  } catch (err) {
    console.error(`  ✖ create failed: ${title.slice(0, 50)} — ${err.message}`);
    failed++;
    return;
  }

  const match = createOut.match(/(t_[a-z0-9]+)/);
  if (!match) {
    console.error(`  ✖ parse failed: ${createOut.slice(0, 80)}`);
    failed++;
    return;
  }
  const taskId = match[1];

  // Move to target status if not triage
  if (status !== 'triage' && status !== 'archive') {
    try {
      execSync(`hermes kanban ${boardFlag} move ${taskId} ${status}`, {
        cwd: ROOT,
        encoding: 'utf8',
      });
    } catch {
      console.warn(`  ⚠ created ${taskId} but move→${status} failed`);
    }
  }

  if (status === 'archive') {
    try {
      execSync(`hermes kanban ${boardFlag} archive ${taskId}`, { cwd: ROOT, encoding: 'utf8' });
    } catch {
      console.warn(`  ⚠ created ${taskId} but archive failed`);
    }
  }

  console.log(`  ✓ ${taskId}  ${display}`);
  created++;
  log.push({ board, taskId, title, status });
}

function ensureBoard(slug, name) {
  if (!EXECUTE) return;
  try {
    execSync(`hermes kanban boards create ${slug} --name ${q(name)} 2>/dev/null || true`, {
      cwd: ROOT,
      encoding: 'utf8',
      shell: true,
    });
  } catch {
    /* already exists */
  }
}

// ── Status mapping helpers ────────────────────────────────────────────────────

function clientTaskStatus(status) {
  if (status === 'done' || status === 'complete' || status === 'completed') return 'archive';
  if (status === 'blocked') return 'blocked';
  if (status === 'in-progress') return 'ready';
  return 'triage';
}

function goalStatus(status) {
  if (status === 'done' || status === 'achieved') return 'archive';
  if (status === 'in-progress') return 'ready';
  return 'triage';
}

function checklistStatus(status) {
  if (status === 'done') return 'archive';
  if (status === 'in-progress') return 'ready';
  return 'triage';
}

// ── Sources ───────────────────────────────────────────────────────────────────

function migrateProposedUnits() {
  console.log('\n── Proposed Units → default ──');
  const lines = readLines('docs/ai/proposed-units.jsonl');
  for (const line of lines) {
    if (!line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const pu = obj.proposedUnit;
    if (!pu?.id) continue;

    const title = pu.name || pu.id;
    const bodyParts = [`Proposed-Unit: ${pu.id}`, `Urgency: ${obj.urgency ?? '?'}`];
    if (pu.description) bodyParts.push('', pu.description);
    if (pu.validationCmd) bodyParts.push('', `Validation: ${pu.validationCmd}`);
    if (pu.agentNotes?.length)
      bodyParts.push('', 'Agent notes:', ...pu.agentNotes.map((n) => `- ${n}`));
    if (pu.dependsOn?.length) bodyParts.push('', `Depends on: ${pu.dependsOn.join(', ')}`);

    run('default', title, bodyParts.join('\n'), 'triage', `proposed-unit-${pu.id}`, pu.model);
  }
}

function migrateRoadmap() {
  console.log('\n── Roadmap → default ──');
  const data = readJson('src/app/data/roadmap.json');
  if (!data) return console.warn('  roadmap.json not found — skipping');

  for (const section of data.sections ?? []) {
    for (let gi = 0; gi < (section.groups ?? []).length; gi++) {
      const group = section.groups[gi];
      for (let ii = 0; ii < (group.items ?? []).length; ii++) {
        const item = group.items[ii];
        const status = item.status ?? '';
        if (status === 'shipped' || status === 'done') continue;

        const title = item.title || item.detail?.slice(0, 80) || 'Untitled roadmap item';
        const bodyParts = [
          `Section: ${section.id ?? section.name ?? '?'}`,
          `Category: ${item.category ?? group.name ?? '?'}`,
        ];
        if (item.detail) bodyParts.push('', item.detail);

        const hermesStatus = status === 'in-progress' ? 'ready' : 'triage';
        run(
          'default',
          title,
          bodyParts.join('\n'),
          hermesStatus,
          `roadmap-${section.id ?? gi}-${gi}-${ii}`,
        );
      }
    }
  }
}

function migrateBacklog() {
  console.log('\n── BACKLOG.md → default ──');
  const lines = readLines('BACKLOG.md');
  let section = 'General';
  let _idx = 0;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim();
      continue;
    }
    const m = line.match(/^\s*[-*] \[( |x|~)\]\s+(.+)/);
    if (!m) continue;
    const done = m[1] !== ' ';
    const text = m[2].trim();
    _idx++;
    if (done) continue;

    // Strip trailing category annotation like [Architecture]
    const title = text.replace(/\s*\[[A-Za-z /]+\]\s*$/, '').trim();
    if (!title) continue;

    const hash = createHash('md5').update(`${section}::${text}`).digest('hex').slice(0, 8);
    run('default', title.slice(0, 120), `Section: ${section}`, 'triage', `backlog-${hash}`);
  }
}

function migrateClientTasks(boardSlug, clientDir, clientName) {
  const data = readJson(`clients/${clientDir}/tasks.json`);
  if (!data) return;

  console.log(`\n── ${clientName} tasks → ${boardSlug} ──`);
  for (const phase of data.phases ?? []) {
    for (const lane of phase.swimlanes ?? []) {
      for (const task of lane.tasks ?? []) {
        const status = clientTaskStatus(task.status);
        const bodyParts = [`Phase: ${phase.name}`, `Lane: ${lane.name}`];
        if (task.owner) bodyParts.push(`Owner: ${task.owner}`);
        if (task.notes) bodyParts.push('', task.notes);
        if (task.blockedReason) bodyParts.push('', `Blocked: ${task.blockedReason}`);

        const assignee = task.owner?.toLowerCase() === 'adrian' ? 'adrian' : undefined;
        run(
          boardSlug,
          task.title,
          bodyParts.join('\n'),
          status,
          `${boardSlug}-task-${task.id}`,
          assignee,
        );
      }
    }
  }
}

function migrateClientGoals(boardSlug, clientDir, clientName) {
  const data = readJson(`clients/${clientDir}/goals.json`);
  if (!data) return;

  console.log(`\n── ${clientName} goals → ${boardSlug} ──`);
  for (const goal of [...(data.micro ?? []), ...(data.macro ?? [])]) {
    const type = data.micro?.includes(goal) ? 'Micro-goal' : 'Macro-goal';
    const status = goalStatus(goal.status);
    const body = [`Type: ${type}`, goal.metric ? `Metric: ${goal.metric}` : '']
      .filter(Boolean)
      .join('\n');
    run(boardSlug, goal.goal?.slice(0, 120), body, status, `${boardSlug}-goal-${goal.id}`);
  }
}

function migrateClientChecklist(boardSlug, clientDir, clientName) {
  const data = readJson(`clients/${clientDir}/checklist.json`);
  if (!data) return;

  console.log(`\n── ${clientName} checklist → ${boardSlug} ──`);
  for (const cat of data.categories ?? []) {
    for (const item of cat.items ?? []) {
      const status = checklistStatus(item.status);
      const bodyParts = [`Category: ${cat.name}`];
      if (item.notes) bodyParts.push('', item.notes);
      run(
        boardSlug,
        item.item?.slice(0, 120),
        bodyParts.join('\n'),
        status,
        `${boardSlug}-cl-${item.id}`,
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nBacklog → Hermes migration`);
console.log(`Mode:  ${EXECUTE ? 'EXECUTE' : 'dry-run'}`);
console.log(`Filter: ${BOARD_FILTER ?? 'all boards'}\n`);

// Ensure client boards exist
if (EXECUTE) {
  if (!BOARD_FILTER || BOARD_FILTER === 'lilac') ensureBoard('lilac', 'Lilac Insure');
  if (!BOARD_FILTER || BOARD_FILTER === 'ranch') ensureBoard('ranch', 'The Ranch Foundation');
  if (!BOARD_FILTER || BOARD_FILTER === 'prospect') ensureBoard('prospect', 'Prospect-001 (Phil)');
}

const run_ = (name, fn) => {
  if (BOARD_FILTER && name !== BOARD_FILTER) return;
  fn();
};

run_('default', () => migrateProposedUnits());
run_('default', () => migrateRoadmap());
run_('default', () => migrateBacklog());
run_('lilac', () => migrateClientTasks('lilac', 'lilac-insure', 'Lilac Insure'));
run_('lilac', () => migrateClientGoals('lilac', 'lilac-insure', 'Lilac Insure'));
run_('lilac', () => migrateClientChecklist('lilac', 'lilac-insure', 'Lilac Insure'));
run_('ranch', () => migrateClientTasks('ranch', 'the-ranch-foundation', 'The Ranch Foundation'));
run_('ranch', () => migrateClientGoals('ranch', 'the-ranch-foundation', 'The Ranch Foundation'));
run_('ranch', () =>
  migrateClientChecklist('ranch', 'the-ranch-foundation', 'The Ranch Foundation'),
);
run_('prospect', () => migrateClientTasks('prospect', 'prospect-001', 'Prospect-001'));
run_('prospect', () => migrateClientGoals('prospect', 'prospect-001', 'Prospect-001'));
run_('prospect', () => migrateClientChecklist('prospect', 'prospect-001', 'Prospect-001'));

console.log('');
if (!EXECUTE) {
  const total = skipped;
  console.log(`Dry-run complete. ${total} tasks would be created.`);
  console.log('Run with --execute to push to Hermes.');
} else {
  console.log(`Done. created=${created} failed=${failed}`);
}
