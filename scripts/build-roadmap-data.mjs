#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src/app/data/roadmap.json');

const SOURCES = {
  tasks: 'TASKS.md',
  backlog: 'BACKLOG.md',
  ideas: 'IDEAS.md',
  manifest: 'public/hds-manifest.json',
  systemsLog: 'docs/SYSTEMS-LOG.md',
};

const sourceText = Object.fromEntries(
  Object.entries(SOURCES).map(([key, path]) => [key, readText(path)]),
);
const manifest = JSON.parse(sourceText.manifest);
const CATEGORY_TAGS = new Set(['Foundations', 'Components', 'Architecture']);

const activeGroups = parseActiveNow(sourceText.tasks);
const { committedGroups, backlogGroups } = parseRoadmapWork(sourceText.backlog);
const ideaGroups = parseIdeas(sourceText.ideas);
const phaseHealth = collectPhaseHealth(manifest, sourceText.backlog);
const latestSystemLog = parseLatestSystemLog(sourceText.systemsLog);

// Slice display data once to keep summary in sync
const displayCommitted = committedGroups.slice(0, 6);
const displayBacklog = backlogGroups.slice(0, 6);
const displayActive = activeGroups;
const displayDiscovery = ideaGroups;

// Compute summary from display data to ensure sync
const countItems = (groups) => groups.reduce((sum, group) => sum + group.items.length, 0);

// Get latest commit hash for the GitHub callout
function getLatestCommitHash() {
  try {
    return execSync('git log --format="%h" -1', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const roadmap = {
  version: 1,
  sourceHash: hashSources(sourceText),
  sources: Object.values(SOURCES),
  summary: {
    active: countItems(displayActive),
    committed: countItems(displayCommitted),
    backlog: countItems(displayBacklog),
    discovery: countItems(displayDiscovery),
  },
  sections: [
    {
      id: 'active',
      label: 'Active',
      confidence: 'Active',
      description: 'Launch work currently being advanced from the active task queue.',
      groups: displayActive,
    },
    {
      id: 'committed',
      label: 'Committed',
      confidence: 'Committed',
      description: 'Validated tickets locked in for the immediate next release cycle.',
      groups: displayCommitted,
    },
    {
      id: 'backlog',
      label: 'Backlog',
      confidence: 'Accepted',
      description: 'Validated work and accepted tickets pending schedule assignment.',
      groups: displayBacklog,
    },
    {
      id: 'discovery',
      label: 'Discovery',
      confidence: 'Discovery',
      description: 'Exploratory concepts and promising ideas requiring validation.',
      groups: displayDiscovery,
    },
  ],
  phaseHealth,
  latestSystemLog,
  latestCommit: latestSystemLog ? {
    hash: getLatestCommitHash(),
    date: latestSystemLog.recordedAt,
    message: latestSystemLog.title,
    displayMessage: deriveCommitDisplayMessage(latestSystemLog.title, latestSystemLog.files),
  } : null,
};

writeFileSync(OUT, `${JSON.stringify(roadmap, null, 2)}\n`);
console.log(`OK ${OUT}`);
console.log(`Roadmap: ${roadmap.summary.active} active, ${roadmap.summary.committed} committed, ${roadmap.summary.backlog} backlog, ${roadmap.summary.discovery} discovery`);

function readText(path) {
  const abs = join(ROOT, path);
  try {
    return readFileSync(abs, 'utf8');
  } catch {
    // File may have been intentionally removed (e.g. TASKS.md deleted 2026-05-01
    // when all active work migrated to docs/ai/orchestration.json).
    return '';
  }
}

function hashSources(textByKey) {
  const hash = createHash('sha256');
  for (const key of Object.keys(textByKey).sort()) {
    hash.update(`\n--- ${key} ---\n`);
    hash.update(textByKey[key]);
  }
  return hash.digest('hex').slice(0, 12);
}

function stripBom(text) {
  return text.replace(/^\uFEFF/, '');
}

function getSection(markdown, heading) {
  const clean = stripBom(markdown);
  const start = clean.indexOf(`## ${heading}`);
  if (start === -1) return '';
  const next = clean.indexOf('\n## ', start + 1);
  return clean.slice(start, next === -1 ? undefined : next);
}

function parseActiveNow(tasksText) {
  const active = getSection(tasksText, 'Active Now');
  return parseH3CheckboxGroups(active)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.status !== 'done').slice(0, 6),
    }))
    .filter((group) => group.items.length > 0);
}

function parseRoadmapWork(backlogText) {
  const clean = stripBom(backlogText);
  const start = clean.indexOf('## Promotion Rules');
  const end = clean.indexOf('## DS v1 Readiness Gate');
  const body = start === -1 ? clean : clean.slice(start, end === -1 ? undefined : end);
  const groups = parseH2CheckboxGroups(body)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.status !== 'done').slice(0, 5),
    }))
    .filter((group) => group.items.length > 0);

  return {
    committedGroups: groups.filter((group) => roadmapStageForGroup(group) === 'committed'),
    backlogGroups: groups.filter((group) => roadmapStageForGroup(group) === 'backlog'),
  };
}

function roadmapStageForGroup(group) {
  const haystack = `${group.title} ${group.items.map((item) => `${item.title} ${item.detail}`).join(' ')}`.toLowerCase();

  if (/\[(backlog|accepted)\]/.test(haystack)) return 'backlog';
  if (/\b(backlog|accepted ticket|pending schedule|post-launch|post launch)\b/.test(haystack)) return 'backlog';

  // Transition fallback: old roadmap work remains Committed until it is
  // explicitly tagged or headed as Backlog.
  return 'committed';
}

function parseIdeas(ideasText) {
  return parseH2Bullets(stripBom(ideasText))
    .map((group) => ({
      ...group,
      items: group.items.slice(0, 5),
    }))
    .filter((group) => group.items.length > 0);
}

function parseH3CheckboxGroups(markdown) {
  return parseHeadingGroups(markdown, /^###\s+(.+)$/gm, /^-\s+\[( |x|X|~)\]\s+(.+)$/);
}

function parseH2CheckboxGroups(markdown) {
  return parseHeadingGroups(markdown, /^##\s+(.+)$/gm, /^-\s+\[( |x|X|~)\]\s+(.+)$/);
}

function parseHeadingGroups(markdown, headingPattern, itemPattern) {
  const matches = [...markdown.matchAll(headingPattern)];
  return matches.map((match, index) => {
    const title = sanitizeTitle(match[1]);
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end);
    return {
      title,
      items: parseCheckboxItems(body, itemPattern),
    };
  }).filter((group) => group.items.length > 0);
}

function parseCheckboxItems(body, itemPattern) {
  const lines = body.split(/\r?\n/);
  const items = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(itemPattern);
    if (!match) continue;

    const status = checkboxStatus(match[1]);
    const raw = match[2].trim();
    const scopeLine = lines[index + 1]?.match(/^\s+Scope:\s+(.+)$/);
    const { text, category } = stripTaskCategory(raw);
    const parsed = splitTitleDescription(text);

    items.push({
      status,
      title: parsed.title,
      detail: scopeLine?.[1]?.trim() ?? parsed.detail,
      category,
    });
  }

  return items;
}

function checkboxStatus(marker) {
  if (/x/i.test(marker)) return 'done';
  if (marker === '~') return 'partial';
  return 'todo';
}

function parseH2Bullets(markdown) {
  const matches = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const title = sanitizeTitle(match[1]);
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end);
    const items = body.split(/\r?\n/)
      .map((line) => line.match(/^-\s+(.+)$/)?.[1])
      .filter(Boolean)
      .map((raw) => {
        const { text, category } = stripTaskCategory(raw);
        const parsed = splitTitleDescription(text);
        return { status: 'idea', title: parsed.title, detail: parsed.detail, category };
      });
    return { title, items };
  }).filter((group) => group.items.length > 0);
}

function splitTitleDescription(raw) {
  const normalized = raw.replace(/\.$/, '').trim();
  const separator = normalized.includes(' - ') ? ' - ' : normalized.includes(' — ') ? ' — ' : null;
  if (!separator) return { title: normalized, detail: '' };
  const [title, ...rest] = normalized.split(separator);
  return {
    title: title.trim(),
    detail: rest.join(separator).trim(),
  };
}

function sanitizeTitle(title) {
  return title.replace(/^P\d+\s+-\s+/, '').trim();
}

function stripTaskCategory(raw) {
  const match = raw.match(/\s+\[(Foundations|Components|Architecture|Infrastructure & Operations)\](?:\.)?\s*$/i);
  if (!match) {
    return { text: raw.trim(), category: undefined };
  }

  const category = normalizeTaskCategory(match[1]);
  return {
    text: raw.slice(0, match.index).trim(),
    category,
  };
}

function normalizeTaskCategory(value) {
  const normalized = value.toLowerCase();
  if (normalized === 'foundations') return 'Foundations';
  if (normalized === 'components') return 'Components';
  if (normalized === 'architecture' || normalized === 'infrastructure & operations') return 'Architecture';
  if (CATEGORY_TAGS.has(value)) return value;
  return 'Architecture';
}


function collectPhaseHealth(manifest, backlogText) {
  const phaseTasks = collectPhaseTasks(backlogText);
  const phases = normalizeRoadmapPhases(manifest.phases ?? []);

  return phases.map((phase) => {
    const criteria = phase.criteria ?? [];
    const score = criteria.length === 0
      ? 0
      : Math.round((criteria.reduce((sum, criterion) => {
          if (criterion.done) return sum + 1;
          if (criterion.partial) return sum + 0.5;
          return sum;
        }, 0) / criteria.length) * 100);

    const task = phase.sourceLabels
      .map((label) => phaseTasks.get(label))
      .find(Boolean) ?? null;

    return {
      id: phase.id,
      label: phase.label,
      description: phase.description ?? '',
      score,
      task: task
        ? {
            ...task,
            phaseId: phase.id,
            phaseLabel: phase.label,
            source: 'BACKLOG.md',
          }
        : null,
    };
  });
}

function normalizeRoadmapPhases(phases) {
  const infrastructureLabels = new Set([
    'Architecture',
    'Infrastructure & Operations',
    'Workflow & Sync',
    'Infrastructure',
  ]);
  const infrastructureIds = new Set([
    'infrastructure-operations',
    'workflow-sync',
    'infrastructure',
  ]);
  const results = [];
  let infrastructureRollup = null;

  for (const phase of phases) {
    const belongsToInfrastructure = infrastructureIds.has(phase.id) || infrastructureLabels.has(phase.label);

    if (!belongsToInfrastructure) {
      results.push({
        ...phase,
        sourceLabels: [phase.label],
      });
      continue;
    }

    infrastructureRollup = infrastructureRollup ?? {
      id: 'infrastructure-operations',
      label: 'Architecture',
      description: 'System delivery, Figma sync, automation, quality gates, and operational hygiene.',
      criteria: [],
      sourceLabels: [],
    };

    infrastructureRollup.criteria.push(...(phase.criteria ?? []));
    infrastructureRollup.sourceLabels.push(phase.label);
  }

  if (infrastructureRollup) {
    results.push({
      ...infrastructureRollup,
      sourceLabels: [...new Set(infrastructureRollup.sourceLabels)],
    });
  }

  return results;
}

function collectPhaseTasks(backlogText) {
  const phaseAudit = getSection(backlogText, 'Manifest-Backed Evolution Phases');
  const groups = parseH3CheckboxGroups(phaseAudit);

  return new Map(groups.map((group) => {
    const task = group.items.find((item) => item.status !== 'done') ?? group.items[0] ?? null;
    return [group.title, task];
  }).filter(([, task]) => Boolean(task)));
}

function parseLatestSystemLog(logText) {
  const clean = stripBom(logText);
  const matches = [...clean.matchAll(/^##\s+(.+?)\s+-\s+(.+)$/gm)];
  const entries = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? clean.length;
    const body = clean.slice(start, end);
    const snapshot = parseSnapshotTable(body);
    return {
      recordedAt: match[1].trim(),
      title: match[2].trim(),
      sortTime: Date.parse(match[1].trim()),
      problemClass: snapshot['Problem Class'] ?? '',
      attackPattern: snapshot['Attack Pattern'] ?? '',
      roi: snapshot['DesignOps ROI'] ?? '',
      bundleImpact: snapshot['Bundle Impact'] ?? '',
      governanceDrift: snapshot['Governance Drift'] ?? snapshot['Governance Drift|'] ?? '',
      files: snapshot['Files'] ?? '',
      metrics: parseTelemetryTable(body),
    };
  });

  const latest = entries
    .filter((entry) => Number.isFinite(entry.sortTime))
    .sort((a, b) => b.sortTime - a.sortTime)[0] ?? entries[0];

  if (!latest) return null;

  return {
    recordedAt: latest.recordedAt,
    title: latest.title,
    problemClass: latest.problemClass,
    attackPattern: latest.attackPattern,
    roi: latest.roi,
    bundleImpact: latest.bundleImpact,
    governanceDrift: latest.governanceDrift,
    files: latest.files,
    metrics: latest.metrics,
  };
}

function deriveCommitDisplayMessage(title, filesText = '') {
  const cleanedTitle = stripCommitPrefix(String(title ?? '').trim());
  const normalizedTitle = cleanedTitle.toLowerCase();
  const fileList = extractFileNames(filesText);

  if (cleanedTitle && !isGenericCommitTitle(normalizedTitle)) {
    return cleanedTitle.slice(0, 1).toUpperCase() + cleanedTitle.slice(1);
  }

  if (fileList.some((file) => isGeneratedPipelineFile(file))) {
    return 'Generated data refresh';
  }

  if (fileList.some((file) => file.startsWith('src/app/pages/hds/'))) {
    return 'HDS surface update';
  }

  if (fileList.some((file) => file.startsWith('src/app/components/'))) {
    return 'Component system update';
  }

  if (fileList.some((file) => file.startsWith('scripts/'))) {
    return 'Pipeline update';
  }

  if (fileList.some((file) => file.endsWith('.md'))) {
    return 'Documentation update';
  }

  return cleanedTitle
    ? cleanedTitle.slice(0, 1).toUpperCase() + cleanedTitle.slice(1)
    : 'Repository update';
}

function stripCommitPrefix(title) {
  return title.replace(/^[a-z]+(?:\([^)]+\))?:\s*/i, '').trim();
}

function isGenericCommitTitle(title) {
  return new Set(['sync', 'test', 'guard', 'update', 'chore', 'fix', 'refactor', 'docs', 'build', 'ci', 'cleanup']).has(title);
}

function extractFileNames(filesText) {
  const matches = [...String(filesText ?? '').matchAll(/`([^`]+)`/g)];
  if (matches.length > 0) {
    return matches.map((match) => match[1]);
  }

  return String(filesText ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isGeneratedPipelineFile(file) {
  return new Set([
    'public/hds-manifest.json',
    'src/app/data/roadmap.json',
    'src/app/data/token-audit-report.json',
    'src/app/data/component-api.json',
    'src/app/data/hds-registry.json',
    'src/app/data/used-icons.json',
    'src/app/design-system/token-usage-map.json',
    'llms.txt',
    'public/llms.txt',
  ]).has(file);
}

function parseSnapshotTable(body) {
  const table = {};
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (key === 'Field' || key === '---') continue;
    table[key.replace(/\s*\|$/, '')] = value;
  }
  return table;
}

function parseTelemetryTable(body) {
  const telemetryStart = body.indexOf('### Telemetry Delta');
  if (telemetryStart === -1) return [];
  return body.slice(telemetryStart).split(/\r?\n/)
    .map((line) => line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/))
    .filter(Boolean)
    .filter((match) => match[1].trim() !== 'Metric' && match[1].trim() !== '---')
    .map((match) => ({
      metric: match[1].trim(),
      current: match[2].trim(),
      delta: match[3].trim(),
    }))
    .slice(0, 3);
}
