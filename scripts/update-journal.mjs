#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * update-journal.mjs
 *
 * Appends a systems-ledger entry to docs/SYSTEMS-LOG.md using the latest
 * token audit report and health history snapshot.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const reportPath = join(ROOT, 'src', 'app', 'data', 'token-audit-report.json');
const historyPath = join(ROOT, 'src', 'app', 'data', 'health-history.json');
const editorialPath = join(ROOT, 'src', 'app', 'data', 'hdsEditorial.tsx');
const journalPath = join(ROOT, 'docs', 'SYSTEMS-LOG.md');

function sanitizePortableText(text) {
  return String(text)
    .replaceAll('Ã¢â‚¬Å“', '"')
    .replaceAll('Ã¢â‚¬ï¿½', '"')
    .replaceAll('Ã¢â‚¬Ëœ', "'")
    .replaceAll('Ã¢â‚¬â„¢', "'")
    .replaceAll('Ã¢â‚¬Â¦', '...')
    .replaceAll('Ã¢â‚¬”', '-')
    .replaceAll('Ã¢â‚¬â€œ', '-')
    .replaceAll('âˆ’', '-')
    .replaceAll('–', '-')
    .replaceAll('Ã¢Ë†’', '-')
    .replaceAll('Ã¢â€ â€œ', '-');
}

function formatRepoPath(filePath) {
  return filePath.replace(ROOT, '').replaceAll('\\', '/').replace(/^\//, '');
}

function extractJsArrayLiteral(source, exportMarker) {
  const exportIndex = source.indexOf(exportMarker);
  if (exportIndex === -1) return null;

  const arrayStart = source.indexOf('[', exportIndex);
  if (arrayStart === -1) return null;

  let depth = 0;
  let inString = null;
  let escaped = false;

  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = char;
      continue;
    }

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(arrayStart, index + 1);
      }
    }
  }

  return null;
}

function loadAuditLogEntries() {
  try {
    const source = readFileSync(editorialPath, 'utf8');
    const arrayText = extractJsArrayLiteral(source, 'export const AUDIT_LOG');
    if (!arrayText) return [];

    const parsed = Function(`'use strict'; return (${arrayText});`)();
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry) => ({
        date: String(entry?.date ?? '').trim(),
        sev: String(entry?.sev ?? '').trim(),
        item: String(entry?.item ?? '').trim(),
      }))
      .filter((entry) => entry.date && entry.sev && entry.item);
  } catch {
    return [];
  }
}

// Files written by the health-sync pipeline itself — never meaningful as "touched" entries.
const PIPELINE_GENERATED_FILES = new Set([
  'docs/SYSTEMS-LOG.md',
  'llms.txt',
  'public/llms.txt',
  'public/hds-manifest.json',
  'src/app/data/health-history.json',
  'src/app/data/token-audit-report.json',
  'src/app/data/component-api.json',
  'src/app/data/used-icons.json',
]);

function isGeneratedFile(file) {
  return PIPELINE_GENERATED_FILES.has(file);
}

function filterSourceFiles(files) {
  return files.filter((f) => !isGeneratedFile(f));
}

function groupSemanticViolationsByFile(violations) {
  const map = new Map();
  for (const violation of violations ?? []) {
    const file = violation.file;
    const expected = violation.expected ?? violation.value ?? 'unknown';
    if (!map.has(file)) {
      map.set(file, {
        file,
        fileName: formatRepoPath(file),
        totalViolations: 0,
        tokenCounts: new Map(),
      });
    }
    const entry = map.get(file);
    entry.totalViolations += 1;
    entry.tokenCounts.set(expected, (entry.tokenCounts.get(expected) ?? 0) + 1);
  }
  return [...map.values()]
    .map((entry) => ({
      ...entry,
      topTokens: [...entry.tokenCounts.entries()]
        .map(([tokenPath, count]) => ({ tokenPath, count }))
        .sort((a, b) => b.count - a.count || a.tokenPath.localeCompare(b.tokenPath))
        .slice(0, 2),
    }))
    .sort((a, b) => b.totalViolations - a.totalViolations || a.file.localeCompare(b.file));
}

function extractHeadingContext(headingLine) {
  const match = /^##\s+.+?\s+-\s+(.+)$/.exec(headingLine.trim());
  return match ? match[1].trim() : headingLine.trim();
}

function splitJournalEntries(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const marker = '\n## ';
  const firstEntryIndex = normalized.indexOf(marker);

  if (firstEntryIndex === -1) {
    return {
      prefix: normalized.trimEnd(),
      entries: [],
    };
  }

  const prefix = normalized.slice(0, firstEntryIndex).trimEnd();
  const rawEntries = normalized
    .slice(firstEntryIndex + 1)
    .split(marker)
    .map((entry) => {
      const trimmed = entry.trim();
      return trimmed.startsWith('## ') ? trimmed : `## ${trimmed}`;
    })
    .filter(Boolean);

  return {
    prefix,
    entries: rawEntries.map((entry) => {
      const [headingLine, ...bodyLines] = entry.split('\n');
      return {
        headingLine,
        context: extractHeadingContext(headingLine),
        body: bodyLines.join('\n').trim(),
      };
    }),
  };
}

function entrySignature(entry) {
  const normalizedBody = entry.body
    .replace(/^\| (Files Touched|Files) \| .* \|$/m, '| Files | <ignored> |')
    .trim();

  return JSON.stringify({
    context: entry.context.trim(),
    body: normalizedBody,
  });
}

function dedupeConsecutiveEntries(entries) {
  const deduped = [];
  let previousSignature = null;

  for (const entry of entries) {
    const signature = entrySignature(entry);
    if (signature === previousSignature) continue;
    deduped.push(entry);
    previousSignature = signature;
  }

  return deduped;
}

function extractFieldValue(entry, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^\\| ${escaped}\\s*\\|\\s*(.+?)\\s*\\|$`, 'm').exec(entry.body);
  return match ? match[1].trim() : null;
}

function isSystemHealthSync(entry) {
  return entry.context.trim() === 'System Health Synchronization';
}

function healthTelemetrySignature(entry) {
  const violations = extractFieldValue(entry, 'Direct Violations');
  const recordedAt = extractFieldValue(entry, 'Snapshot Recorded At');
  if (!violations || !recordedAt) return null;

  return JSON.stringify({
    recordedAt,
    violations,
  });
}

function isNoOpHealthSync(entry) {
  return /Change vs previous snapshot:\s+0 direct violations\./.test(entry.body);
}

function healthEntryQuality(entry) {
  let score = 0;
  const problemClass = extractFieldValue(entry, 'Focus') ?? extractFieldValue(entry, 'Problem Class') ?? '';
  const attackPattern = extractFieldValue(entry, 'Change Pattern') ?? extractFieldValue(entry, 'Attack Pattern') ?? '';
  const filesTouched = extractFieldValue(entry, 'Files') ?? extractFieldValue(entry, 'Files Touched') ?? '';

  if (problemClass !== 'docs chrome') score += 2;
  if (attackPattern !== 'docs chrome normalization') score += 1;
  if (filesTouched !== 'Original ledger did not preserve file-level paths.') score += 1;

  return score;
}

function compactHealthSyncEntries(entries) {
  const compacted = [];
  const seenSignatures = new Map();

  for (const entry of entries) {
    if (!isSystemHealthSync(entry)) {
      compacted.push(entry);
      continue;
    }

    if (isNoOpHealthSync(entry)) {
      continue;
    }

    const signature = healthTelemetrySignature(entry);
    if (!signature) {
      compacted.push(entry);
      continue;
    }

    if (seenSignatures.has(signature)) {
      const previousIndex = seenSignatures.get(signature);
      const previous = compacted[previousIndex];
      if (healthEntryQuality(entry) > healthEntryQuality(previous)) {
        compacted[previousIndex] = entry;
      }
      continue;
    }

    seenSignatures.set(signature, compacted.length);
    compacted.push(entry);
  }

  return compacted;
}

function deriveProblemClass(contextLabel, files) {
  const haystack = `${contextLabel} ${files.map((entry) => entry.fileName).join(' ')}`.toLowerCase();
  if (
    haystack.includes('pipeline')
    || haystack.includes('manifest')
    || haystack.includes('ledger')
    || haystack.includes('log')
    || haystack.includes('health')
    || haystack.includes('telemetry')
    || haystack.includes('synchronization')
    || haystack.includes('sync')
  ) {
    return 'pipeline, governance';
  }
  if (haystack.includes('table')) return 'tables';
  if (haystack.includes('typography')) return 'typography';
  if (haystack.includes('color')) return 'color';
  if (haystack.includes('layout') || haystack.includes('shell') || haystack.includes('navigation')) return 'layout';
  if (haystack.includes('token')) return 'tokens';
  if (haystack.includes('responsive') || haystack.includes('breakpoint')) return 'responsiveness';
  if (haystack.includes('mojibake') || haystack.includes('encoding')) return 'encoding';
  if (haystack.includes('case study')) return 'editorial';
  return 'docs chrome';
}

function deriveAttackPattern(problemClass) {
  switch (problemClass) {
    case 'pipeline, governance':
      return 'telemetry normalization, policy enforcement';
    case 'tables':
      return 'slot API / table normalization';
    case 'typography':
      return 'typographic remap / hierarchy cleanup';
    case 'color':
      return 'semantic color alignment';
    case 'layout':
      return 'semantic spacing / shell cleanup';
    case 'tokens':
      return 'alias normalization / usage mapping';
    case 'responsiveness':
      return 'fluid scale / adaptive tokens';
    case 'encoding':
      return 'portable text sanitation';
    case 'editorial':
      return 'editorial layout tuning';
    default:
      return 'docs chrome normalization';
  }
}

function deriveDesignOpsROI(problemClass, contextLabel) {
  const haystack = `${problemClass} ${contextLabel}`.toLowerCase();
  if (haystack.includes('pipeline') || haystack.includes('ledger') || haystack.includes('log')) {
    return 'Improved governance readability and reduced manual interpretation overhead for architecture reviews.';
  }
  if (haystack.includes('table')) {
    return 'Standardized documentation presentation so design system surfaces stay legible and easier to maintain.';
  }
  if (haystack.includes('typography')) {
    return 'Improved documentation hierarchy so token and component guidance scan more quickly for designers and engineers.';
  }
  if (haystack.includes('color')) {
    return 'Clarified semantic color communication, reducing ambiguity in token consumption and review.';
  }
  if (haystack.includes('layout')) {
    return 'Improved shell consistency so documentation navigation and inspector surfaces require less manual tuning.';
  }
  if (haystack.includes('token')) {
    return 'Improved token inspection throughput by making lineage, impact, and governance cues easier to parse.';
  }
  if (haystack.includes('encoding')) {
    return 'Improved cross-platform content reliability by eliminating encoding drift in source-of-truth documentation.';
  }
  return 'Reduced manual cleanup by standardizing the relevant design system surface.';
}

function deriveBundleImpact(problemClass, contextLabel) {
  const haystack = `${problemClass} ${contextLabel}`.toLowerCase();
  if (haystack.includes('pipeline') || haystack.includes('ledger') || haystack.includes('log')) {
    return 'Dev-only script and ledger update; no runtime payload impact.';
  }
  if (haystack.includes('token') || haystack.includes('table') || haystack.includes('layout') || haystack.includes('typography') || haystack.includes('color')) {
    return 'Neutral; documentation-shell and design-system surface refinement only.';
  }
  if (haystack.includes('encoding')) {
    return 'Neutral; text sanitation only.';
  }
  return 'Neutral.';
}

function deriveGovernanceDrift(problemClass, contextLabel) {
  const haystack = `${problemClass} ${contextLabel}`.toLowerCase();
  if (haystack.includes('intent gate') || haystack.includes('ledger') || haystack.includes('log')) {
    return 'Prevented via explicit intent capture and normalized governance telemetry.';
  }
  if (haystack.includes('table') || haystack.includes('preview')) {
    return 'Reduced via shared documentation primitives and fewer one-off surface patterns.';
  }
  if (haystack.includes('typography') || haystack.includes('color') || haystack.includes('spacing') || haystack.includes('semantic')) {
    return 'Reduced via tighter semantic-tier alignment and clearer system-level presentation.';
  }
  if (haystack.includes('token')) {
    return 'Reduced via a more consistent inspection surface and shared token-node grammar.';
  }
  if (haystack.includes('encoding')) {
    return 'Prevented via sanitized portable text in source-of-truth documentation.';
  }
  return 'Reduced via standardized system conventions.';
}

function deriveFilesTouched(files) {
  if (files.length === 0) return 'Original ledger did not preserve file-level paths.';
  return files.map((entry) => `\`${sanitizePortableText(entry.fileName)}\``).join(', ');
}

function parseGitFileList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatFileList(files) {
  return files.slice(0, 8).map((file) => `\`${sanitizePortableText(file)}\``).join(', ');
}

const AUDIT_STOPWORDS = new Set([
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'can',
  'do',
  'for',
  'from',
  'have',
  'into',
  'is',
  'it',
  'its',
  'less',
  'more',
  'new',
  'not',
  'of',
  'on',
  'or',
  'our',
  'out',
  'own',
  'same',
  'so',
  'that',
  'the',
  'their',
  'this',
  'those',
  'to',
  'use',
  'used',
  'using',
  'via',
  'was',
  'were',
  'when',
  'with',
  'work',
  'worked',
  'working',
  'yet',
]);

const AUDIT_KEYWORD_WEIGHTS = new Map([
  ['audit', 5],
  ['audits', 5],
  ['log', 4],
  ['logs', 4],
  ['journal', 4],
  ['health', 4],
  ['manifest', 4],
  ['pipeline', 4],
  ['token', 4],
  ['tokens', 4],
  ['component', 4],
  ['components', 4],
  ['semantic', 4],
  ['mapping', 4],
  ['docs', 3],
  ['documentation', 3],
  ['design', 3],
  ['system', 3],
  ['systems', 3],
  ['layout', 3],
  ['typography', 3],
  ['color', 3],
  ['colors', 3],
  ['spacing', 3],
  ['motion', 3],
  ['figma', 3],
  ['registry', 3],
  ['roadmap', 3],
  ['table', 2],
  ['tables', 2],
  ['button', 2],
  ['buttons', 2],
  ['card', 2],
  ['cards', 2],
  ['input', 2],
  ['inputs', 2],
  ['select', 2],
  ['slider', 2],
  ['toggle', 2],
  ['navigation', 2],
  ['nav', 2],
  ['shell', 2],
  ['preview', 2],
  ['toolbar', 2],
]);

function tokenizeSearchText(text) {
  return [...new Set(
    String(text)
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length > 2 && !AUDIT_STOPWORDS.has(token))
      ?? [],
  )];
}

function scoreAuditEntry(entry, queryText, queryTokens) {
  const itemText = entry.item.toLowerCase();
  let score = 0;

  for (const [keyword, weight] of AUDIT_KEYWORD_WEIGHTS.entries()) {
    if (queryText.includes(keyword) && itemText.includes(keyword)) {
      score += weight;
    }
  }

  const itemTokens = new Set(tokenizeSearchText(entry.item));
  let overlap = 0;
  for (const token of queryTokens) {
    if (itemTokens.has(token)) {
      overlap += 1;
    }
  }

  score += Math.min(overlap, 6) * 0.5;
  if (entry.sev === 'fixed') score += 0.25;
  if (entry.sev === 'added') score += 0.1;
  return score;
}

function deriveAuditHighlights({ context, intent, filesTouched, problemClass, attackPattern, designOpsROI, bundleImpact, governanceDrift }) {
  const auditEntries = loadAuditLogEntries();
  if (auditEntries.length === 0) return [];

  const queryText = [
    context,
    intent,
    problemClass,
    attackPattern,
    designOpsROI,
    bundleImpact,
    governanceDrift,
    ...(filesTouched ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const queryTokens = tokenizeSearchText(queryText);

  return auditEntries
    .map((entry) => ({
      ...entry,
      score: scoreAuditEntry(entry, queryText, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.item.localeCompare(b.item))
    .slice(0, 3);
}

function formatAuditHighlights(auditHighlights) {
  if (!auditHighlights || auditHighlights.length === 0) return [];

  return [
    '### Audit Highlights',
    '| Date | Sev | Highlight |',
    '| --- | --- | --- |',
    ...auditHighlights.map((entry) => `| ${sanitizePortableText(entry.date)} | ${sanitizePortableText(entry.sev.toUpperCase())} | ${sanitizePortableText(entry.item)} |`),
    '',
  ];
}

function deriveGitTouchedFiles({ stagedOnly = false } = {}) {
  try {
    if (stagedOnly) {
      const stagedOutput = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const stagedFiles = filterSourceFiles(parseGitFileList(stagedOutput));
      return stagedFiles.length > 0 ? formatFileList(stagedFiles) : null;
    }

    // Try working-tree changes first (pre-commit / dev session flow).
    const workingTreeOutput = execFileSync('git', ['diff', 'HEAD', '--name-only'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const workingFiles = filterSourceFiles(parseGitFileList(workingTreeOutput));
    if (workingFiles.length > 0) {
      return formatFileList(workingFiles);
    }

    // Fall back to last commit (post-commit pipeline flow — working tree is clean).
    const lastCommitOutput = execFileSync('git', ['diff', 'HEAD~1', 'HEAD', '--name-only'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const commitFiles = filterSourceFiles(parseGitFileList(lastCommitOutput));
    if (commitFiles.length > 0) {
      return formatFileList(commitFiles);
    }

    return null;
  } catch {
    return null;
  }
}

function parseCommitMessage(messageText) {
  const lines = String(messageText)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .map((line) => line.trimEnd());

  const body = lines.join('\n').trim();
  if (!body) {
    return { subject: '', body: '' };
  }

  const [subjectLine, ...bodyLines] = body.split('\n');
  return {
    subject: subjectLine.trim(),
    body: bodyLines.join('\n').trim(),
  };
}

function appendCommitSystemsLogEntry(messagePath) {
  const messageText = readFileSync(messagePath, 'utf8');
  const commitMessage = parseCommitMessage(messageText);
  const context = commitMessage.subject || 'Commit';
  const intent = commitMessage.body
    ? sanitizePortableText(commitMessage.body.replace(/\s+/g, ' ').trim())
    : sanitizePortableText(`Captured the staged changes for "${context}".`);

  return appendSystemsLogEntry({
    context,
    intent,
    timestamp: new Date().toISOString(),
    stagedOnly: true,
  });
}

function appendRenderedJournalEntry(entryText) {
  const normalizedEntry = String(entryText ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalizedEntry) {
    throw new Error('appendRenderedJournalEntry requires entry text.');
  }

  const [headingLine, ...bodyLines] = normalizedEntry.split('\n');
  const nextEntry = {
    headingLine,
    context: extractHeadingContext(headingLine),
    body: bodyLines.join('\n').trim(),
  };

  const existingJournal = existsSync(journalPath) ? readFileSync(journalPath, 'utf8').trimEnd() : '';
  const parsedJournal = splitJournalEntries(existingJournal);
  const dedupedEntries = compactHealthSyncEntries(dedupeConsecutiveEntries(parsedJournal.entries));
  const nextSignature = entrySignature(nextEntry);
  const lastSignature = dedupedEntries.length > 0 ? entrySignature(dedupedEntries[dedupedEntries.length - 1]) : null;
  const finalEntries = nextSignature === lastSignature ? dedupedEntries : [...dedupedEntries, nextEntry];
  const prefix = parsedJournal.prefix || '# SYSTEMS LOG\n\nAppend-only ledger of governance updates.';
  const renderedEntries = finalEntries
    .map((entry) => `${entry.headingLine}\n${entry.body}`.trim())
    .join('\n\n');
  const nextJournal = `${prefix.trimEnd()}\n\n${renderedEntries}\n`;

  writeFileSync(journalPath, sanitizePortableText(nextJournal), { encoding: 'utf8' });
  return {
    context: nextEntry.context,
    generatedAt: sanitizePortableText(headingLine.replace(/^##\s+/, '').split(' - ')[0] ?? ''),
  };
}

function deriveIntentExecution(architecturalIntent) {
  return sanitizePortableText((architecturalIntent || 'Intent provided at commit time.').trim());
}

function formatSigned(value) {
  if (value === null) return 'baseline';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}`;
}

export function appendSystemsLogEntry({ context, intent, timestamp = null, stagedOnly = false }) {
  const safeContext = (context ?? '').trim();
  const explicitIntent = (intent ?? '').trim();

  if (!safeContext) {
    throw new Error('appendSystemsLogEntry requires a context string.');
  }
  if (!explicitIntent) {
    throw new Error('appendSystemsLogEntry requires an architectural intent string.');
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const history = JSON.parse(readFileSync(historyPath, 'utf8'));

  const currentHistorySnapshot = Array.isArray(history) && history.length > 0 ? history[history.length - 1] : null;
  const previousSnapshot = Array.isArray(history)
    ? [...history]
        .reverse()
        .find((entry) =>
          entry !== currentHistorySnapshot
          && (
            entry?.totalViolations !== currentHistorySnapshot?.totalViolations
            || entry?.score !== currentHistorySnapshot?.score
            || entry?.grade !== currentHistorySnapshot?.grade
          ),
        ) ?? null
    : null;

  const currentViolations = report.counts?.semanticMappingViolations ?? 0;
  const previousViolations = typeof previousSnapshot?.totalViolations === 'number' ? previousSnapshot.totalViolations : null;
  const violationDelta = previousViolations === null ? null : currentViolations - previousViolations;
  const snapshotSource = '[health-history.json](../src/app/data/health-history.json)';

  const gitTouchedFiles = deriveGitTouchedFiles({ stagedOnly });
  const auditSourceFiles = stagedOnly && gitTouchedFiles
    ? extractFilePaths(gitTouchedFiles).map((fileName) => ({ fileName }))
    : stagedOnly
      ? []
      : groupSemanticViolationsByFile(report.semanticMappingViolations ?? []).slice(0, 4);
  const problemClass = deriveProblemClass(safeContext, auditSourceFiles);
  const attackPattern = deriveAttackPattern(problemClass);
  const designOpsROI = deriveDesignOpsROI(problemClass, safeContext);
  const bundleImpact = deriveBundleImpact(problemClass, safeContext);
  const governanceDrift = deriveGovernanceDrift(problemClass, safeContext);
  const filesTouched = stagedOnly
    ? gitTouchedFiles ?? 'No staged source files were detected.'
    : gitTouchedFiles ?? deriveFilesTouched(auditSourceFiles);
  const intentExecution = deriveIntentExecution(sanitizePortableText(explicitIntent));
  const auditHighlights = deriveAuditHighlights({
    context: safeContext,
    intent: explicitIntent,
    filesTouched: auditSourceFiles.map((entry) => entry.fileName),
    problemClass,
    attackPattern,
    designOpsROI,
    bundleImpact,
    governanceDrift,
  });
  const auditHighlightLines = formatAuditHighlights(auditHighlights);

  const telemetryRows = [
    {
      metric: 'Direct Violations',
      value: String(currentViolations),
      source: snapshotSource,
    },
    {
      metric: 'Snapshot Recorded At',
      value: sanitizePortableText(report.generatedAt),
      source: snapshotSource,
    },
  ];

  const entryLines = [
    `## ${sanitizePortableText(timestamp ?? report.generatedAt)} - ${sanitizePortableText(safeContext)}`,
    '',
    '### Architectural Snapshot',
    '| Field | Value |',
    '| --- | --- |',
    `| Focus | ${sanitizePortableText(problemClass)} |`,
    `| Change Pattern | ${sanitizePortableText(attackPattern)} |`,
    `| Why It Matters | ${sanitizePortableText(designOpsROI)} |`,
    `| Runtime Impact | ${sanitizePortableText(bundleImpact)} |`,
    `| System Effect | ${sanitizePortableText(governanceDrift)} |`,
    `| Files | ${filesTouched} |`,
    '',
    '### Intent & Execution',
    intentExecution,
    '',
    ...auditHighlightLines,
    '### Health Snapshot',
    '| Metric | Value | Source |',
    '| --- | --- | --- |',
    ...telemetryRows.map((row) => `| ${row.metric} | ${row.value} | ${row.source} |`),
    '',
    `Change vs previous snapshot: ${violationDelta === null ? 'baseline' : `${formatSigned(violationDelta)} direct violations`}.`,
    '',
    '---',
    '',
  ];
  return appendRenderedJournalEntry(entryLines.join('\n'));
}

function getCommitTimestamp(commitRef) {
  try {
    const output = execFileSync('git', ['show', '-s', '--format=%aI', commitRef], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const time = output ? new Date(output).getTime() : Number.NaN;
    return Number.isNaN(time) ? Date.now() : time;
  } catch {
    return Date.now();
  }
}

function appendCommittedSystemsLogEntry(commitRef = 'HEAD') {
  const snapshots = loadHealthHistorySnapshots();
  const commit = {
    hash: commitRef,
    time: getCommitTimestamp(commitRef),
  };
  const entryText = buildHistoricalEntry(commit, snapshots);
  return appendRenderedJournalEntry(entryText);
}

// ── Retroactive file-path archaeology ────────────────────────────────────────

function getAllCommits() {
  try {
    const output = execFileSync('git', ['log', '--format=%H %aI', '--all'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, isoDate] = line.trim().split(' ');
        return { hash, time: new Date(isoDate).getTime() };
      })
      .filter((c) => !Number.isNaN(c.time))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

function findNearestCommit(commits, targetTime) {
  if (commits.length === 0) return null;
  let nearest = commits[0];
  let minDiff = Math.abs(commits[0].time - targetTime);
  for (const commit of commits) {
    const diff = Math.abs(commit.time - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = commit;
    }
  }
  // Trust matches within 24 hours — covers long uncommitted iteration sessions.
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  return minDiff <= TWENTY_FOUR_HOURS ? nearest : null;
}

function getCommitFiles(hash) {
  try {
    const output = execFileSync('git', ['show', '--name-only', '--format=', hash], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return filterSourceFiles(parseGitFileList(output));
  } catch {
    return [];
  }
}

function extractFilesTouched(entry) {
  return extractFieldValue(entry, 'Files') ?? extractFieldValue(entry, 'Files Touched') ?? '';
}

function filesTouchedNeedsRepair(filesTouched) {
  if (!filesTouched || filesTouched === 'Original ledger did not preserve file-level paths.' || filesTouched === 'No source files changed.') {
    return true;
  }
  // If every file in the list is a generated pipeline artifact, the field has no useful signal.
  const paths = (filesTouched.match(/`([^`]+)`/g) ?? []).map((m) => m.replaceAll('`', ''));
  return paths.length > 0 && paths.every((f) => isGeneratedFile(f));
}

function extractFilePaths(filesTouched) {
  return (filesTouched.match(/`([^`]+)`/g) ?? []).map((m) => m.replaceAll('`', ''));
}

function repairEntryFilesTouched(entry, commits) {
  const filesTouched = extractFilesTouched(entry);

  // Strip any generated files from whatever is currently listed.
  const existing = extractFilePaths(filesTouched);
  const cleaned = existing.filter((f) => !isGeneratedFile(f));

  // If we stripped everything (or the fallback text was there), try git archaeology.
  if (filesTouchedNeedsRepair(filesTouched) || cleaned.length === 0) {
    const timeMatch = /^##\s+(.+?)\s+-\s+/.exec(entry.headingLine);
    if (!timeMatch) return entry;

    const entryTime = new Date(timeMatch[1]).getTime();
    const commit = findNearestCommit(commits, entryTime);
    const commitFiles = commit ? getCommitFiles(commit.hash) : [];

    // Merge commit files with any real files already in the entry.
    const merged = [...new Set([...cleaned, ...commitFiles])].slice(0, 8);
    if (merged.length === 0) return entry;

    const newBody = entry.body.replace(
      /^\| (Files Touched|Files) \| .+ \|$/m,
      `| Files | ${formatFileList(merged)} |`,
    );
    return { ...entry, body: newBody };
  }

  // If only some files were generated, replace the field with the cleaned list.
  if (cleaned.length < existing.length) {
    const newBody = entry.body.replace(
      /^\| (Files Touched|Files) \| .+ \|$/m,
      `| Files | ${formatFileList(cleaned)} |`,
    );
    return { ...entry, body: newBody };
  }

  return entry;
}

export function repairAllEntries() {
  const existingJournal = existsSync(journalPath) ? readFileSync(journalPath, 'utf8').trimEnd() : '';
  if (!existingJournal) return { entriesBefore: 0, entriesAfter: 0, filesPatched: 0 };

  const parsedJournal = splitJournalEntries(existingJournal);
  const commits = getAllCommits();
  const snapshots = loadHealthHistorySnapshots();

  let filesPatched = 0;
  const withRepairedFiles = parsedJournal.entries.map((entry) => {
    const repaired = repairEntryFilesTouched(entry, commits);
    const normalizedBody = normalizeEntryBody(repaired, snapshots);
    const normalized = normalizedBody === repaired.body ? repaired : { ...repaired, body: normalizedBody };
    if (normalized !== entry) filesPatched += 1;
    return normalized;
  });

  const deduped = compactHealthSyncEntries(dedupeConsecutiveEntries(withRepairedFiles));
  const prefix = parsedJournal.prefix || '# SYSTEMS LOG\n\nAppend-only ledger of governance updates.';
  const rendered = deduped.map((entry) => `${entry.headingLine}\n${entry.body}`.trim()).join('\n\n');
  const nextJournal = `${prefix.trimEnd()}\n\n${rendered}\n`;

  writeFileSync(journalPath, sanitizePortableText(nextJournal), { encoding: 'utf8' });

  return {
    entriesBefore: parsedJournal.entries.length,
    entriesAfter: deduped.length,
    filesPatched,
  };
}

export function repairSystemsLog() {
  const existingJournal = existsSync(journalPath) ? readFileSync(journalPath, 'utf8').trimEnd() : '';
  if (!existingJournal) return { removedEntries: 0 };

  const parsedJournal = splitJournalEntries(existingJournal);
  const repairedEntries = compactHealthSyncEntries(dedupeConsecutiveEntries(parsedJournal.entries));
  const prefix = parsedJournal.prefix || '# SYSTEMS LOG\n\nAppend-only ledger of governance updates.';
  const renderedEntries = repairedEntries
    .map((entry) => `${entry.headingLine}\n${entry.body}`.trim())
    .join('\n\n');
  const nextJournal = `${prefix.trimEnd()}\n\n${renderedEntries}\n`;

  writeFileSync(journalPath, sanitizePortableText(nextJournal), { encoding: 'utf8' });

  return {
    removedEntries: parsedJournal.entries.length - repairedEntries.length,
  };
}

function loadHealthHistorySnapshots() {
  try {
    const history = JSON.parse(readFileSync(historyPath, 'utf8'));
    return Array.isArray(history)
      ? history
          .filter((entry) => entry && typeof entry === 'object')
          .sort((a, b) => new Date(a.generatedAt ?? a.recordedAt ?? 0).getTime() - new Date(b.generatedAt ?? b.recordedAt ?? 0).getTime())
      : [];
  } catch {
    return [];
  }
}

function getSnapshotTime(snapshot) {
  const value = snapshot?.generatedAt ?? snapshot?.recordedAt ?? null;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

function getSnapshotViolations(snapshot) {
  return typeof snapshot?.counts?.semanticMappingViolations === 'number'
    ? snapshot.counts.semanticMappingViolations
    : typeof snapshot?.totalViolations === 'number'
      ? snapshot.totalViolations
      : 0;
}

function findNearestHealthSnapshot(snapshots, targetTime) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return null;

  let nearest = snapshots[0];
  let minDiff = Math.abs((getSnapshotTime(nearest) ?? 0) - targetTime);

  for (const snapshot of snapshots) {
    const snapshotTime = getSnapshotTime(snapshot);
    if (snapshotTime === null) continue;
    const diff = Math.abs(snapshotTime - targetTime);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = snapshot;
    }
  }

  return nearest;
}

function buildHealthSnapshotSection(snapshot, previousSnapshot) {
  const snapshotSource = '[health-history.json](../src/app/data/health-history.json)';
  const currentViolations = getSnapshotViolations(snapshot);
  const previousViolations = previousSnapshot ? getSnapshotViolations(previousSnapshot) : null;
  const changeText = previousViolations === null ? 'baseline' : `${formatSigned(currentViolations - previousViolations)} direct violations`;
  const recordedAt = sanitizePortableText(snapshot?.generatedAt ?? snapshot?.recordedAt ?? 'unknown');

  return [
    '### Health Snapshot',
    '| Metric | Value | Source |',
    '| --- | --- | --- |',
    `| Direct Violations | ${sanitizePortableText(String(currentViolations))} | ${snapshotSource} |`,
    `| Snapshot Recorded At | ${recordedAt} | ${snapshotSource} |`,
    '',
    `Change vs previous snapshot: ${changeText}.`,
  ];
}

function normalizeArchitecturalSnapshotLabels(body) {
  return body
    .replace(/\| Problem Class \|/g, '| Focus |')
    .replace(/\| Attack Pattern \|/g, '| Change Pattern |')
    .replace(/\| DesignOps ROI \|/g, '| Why It Matters |')
    .replace(/\| Bundle Impact \|/g, '| Runtime Impact |')
    .replace(/\| Governance Drift\|/g, '| System Effect |')
    .replace(/\| Files Touched \|/g, '| Files |');
}

function normalizeEntryBody(entry, snapshots) {
  const entryTimeMatch = /^##\s+(.+?)\s+-\s+/.exec(entry.headingLine);
  const entryTime = entryTimeMatch ? new Date(entryTimeMatch[1]).getTime() : Number.NaN;
  const snapshot = Number.isNaN(entryTime) ? null : findNearestHealthSnapshot(snapshots, entryTime);
  const snapshotIndex = snapshot ? snapshots.findIndex((entrySnapshot) => entrySnapshot === snapshot) : -1;
  const previousSnapshot = snapshotIndex > 0 ? snapshots[snapshotIndex - 1] : null;
  const bodyWithoutTelemetry = entry.body
    .replace(/\n### (Telemetry Delta|Health Snapshot)[\s\S]*$/s, '')
    .replace(/\n---$/s, '')
    .trimEnd();
  const normalizedBody = normalizeArchitecturalSnapshotLabels(bodyWithoutTelemetry);
  const snapshotLines = snapshot ? buildHealthSnapshotSection(snapshot, previousSnapshot) : [
    '### Health Snapshot',
    '| Metric | Value | Source |',
    '| --- | --- | --- |',
    '| Direct Violations | 0 | [health-history.json](../src/app/data/health-history.json) |',
    '| Snapshot Recorded At | unknown | [health-history.json](../src/app/data/health-history.json) |',
    '',
    'Change vs previous snapshot: baseline.',
  ];

  return `${normalizedBody}\n\n${snapshotLines.join('\n')}\n\n---`;
}

function parseCommitDetails(hash) {
  try {
    const output = execFileSync('git', ['show', '--no-patch', '--format=%s%n%b', hash], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).replace(/\r\n/g, '\n').trim();

    if (!output) {
      return { subject: 'Commit', body: '' };
    }

    const [subjectLine, ...bodyLines] = output.split('\n');
    return {
      subject: subjectLine.trim() || 'Commit',
      body: bodyLines.join('\n').trim(),
    };
  } catch {
    return { subject: 'Commit', body: '' };
  }
}

function buildHistoricalEntry(commit, snapshots) {
  const commitDetails = parseCommitDetails(commit.hash);
  const commitFiles = getCommitFiles(commit.hash);
  const commitTime = new Date(commit.time).toISOString();
  const snapshot = findNearestHealthSnapshot(snapshots, commit.time);
  const snapshotIndex = snapshot ? snapshots.findIndex((entry) => entry === snapshot) : -1;
  const previousSnapshot = snapshotIndex > 0 ? snapshots[snapshotIndex - 1] : null;

  const fileObjects = commitFiles.map((fileName) => ({ fileName }));
  const problemClass = deriveProblemClass(commitDetails.subject, fileObjects);
  const attackPattern = deriveAttackPattern(problemClass);
  const designOpsROI = deriveDesignOpsROI(problemClass, commitDetails.subject);
  const bundleImpact = deriveBundleImpact(problemClass, commitDetails.subject);
  const governanceDrift = deriveGovernanceDrift(problemClass, commitDetails.subject);
  const filesTouched = commitFiles.length > 0 ? formatFileList(commitFiles) : 'No source files changed.';
  const intentExecution = sanitizePortableText((commitDetails.body || `Recorded the git commit and its changed files so the systems log stays aligned with the repository timeline.`).trim());
  const auditHighlights = deriveAuditHighlights({
    context: commitDetails.subject,
    intent: intentExecution,
    filesTouched: commitFiles,
    problemClass,
    attackPattern,
    designOpsROI,
    bundleImpact,
    governanceDrift,
  });
  const auditHighlightLines = formatAuditHighlights(auditHighlights);
  const snapshotLines = snapshot ? buildHealthSnapshotSection(snapshot, previousSnapshot) : [];

  return [
    `## ${commitTime} - ${sanitizePortableText(commitDetails.subject)}`,
    '',
    '### Architectural Snapshot',
    '| Field | Value |',
    '| --- | --- |',
    `| Focus | ${sanitizePortableText(problemClass)} |`,
    `| Change Pattern | ${sanitizePortableText(attackPattern)} |`,
    `| Why It Matters | ${sanitizePortableText(designOpsROI)} |`,
    `| Runtime Impact | ${sanitizePortableText(bundleImpact)} |`,
    `| System Effect | ${sanitizePortableText(governanceDrift)} |`,
    `| Files | ${filesTouched} |`,
    '',
    '### Intent & Execution',
    intentExecution,
    '',
    ...auditHighlightLines,
    ...snapshotLines,
    '',
    '---',
    '',
  ].join('\n');
}

export function reconcileRecentCommits() {
  const existingJournal = existsSync(journalPath) ? readFileSync(journalPath, 'utf8').trimEnd() : '';
  const parsedJournal = splitJournalEntries(existingJournal);
  const latestEntry = parsedJournal.entries[parsedJournal.entries.length - 1] ?? null;
  const latestEntryTime = latestEntry ? new Date(latestEntry.headingLine.replace(/^##\s+/, '').split(' - ')[0]).getTime() : null;
  const snapshots = loadHealthHistorySnapshots();
  const commits = getAllCommits();
  const missingCommits = commits.filter((commit) => latestEntryTime === null || commit.time > latestEntryTime);

  if (missingCommits.length === 0) {
    return { addedEntries: 0 };
  }

  const existingBodies = new Set(parsedJournal.entries.map(entrySignature));
  const renderedMissing = [];

  for (const commit of missingCommits) {
    const entry = buildHistoricalEntry(commit, snapshots);
    const signature = entrySignature({
      headingLine: entry.split('\n')[0],
      context: entry.split('\n')[0].replace(/^##\s+.+?\s+-\s+/, ''),
      body: entry.split('\n').slice(1).join('\n').trim(),
    });

    if (existingBodies.has(signature)) {
      continue;
    }

    existingBodies.add(signature);
    renderedMissing.push(entry.trim());
  }

  if (renderedMissing.length === 0) {
    return { addedEntries: 0 };
  }

  const prefix = parsedJournal.prefix || '# SYSTEMS LOG\n\nAppend-only ledger of governance updates.';
  const currentEntries = parsedJournal.entries.map((entry) => `${entry.headingLine}\n${entry.body}`.trim());
  const nextJournal = `${prefix.trimEnd()}\n\n${[...currentEntries, ...renderedMissing].join('\n\n')}\n`;

  writeFileSync(journalPath, sanitizePortableText(nextJournal), { encoding: 'utf8' });
  return { addedEntries: renderedMissing.length };
}

export function main(argv = process.argv.slice(2)) {
  if (argv[0] === '--repair') {
    const result = repairSystemsLog();
    console.log(`Repaired systems log; removed ${result.removedEntries} redundant entries.`);
    return;
  }

  if (argv[0] === '--repair-all') {
    const result = repairAllEntries();
    console.log(`Repaired systems log:`);
    console.log(`  Entries before: ${result.entriesBefore}`);
    console.log(`  Entries after:  ${result.entriesAfter} (${result.entriesBefore - result.entriesAfter} deduplicated)`);
    console.log(`  Files Touched patched: ${result.filesPatched}`);
    return;
  }

  if (argv[0] === '--reconcile') {
    const result = reconcileRecentCommits();
    console.log(`Reconciled systems log; added ${result.addedEntries} missing commit entr${result.addedEntries === 1 ? 'y' : 'ies'}.`);
    return;
  }

  if (argv[0] === '--commit-msg') {
    const messagePath = argv[1];
    if (!messagePath) {
      console.error('Usage: node scripts/update-journal.mjs --commit-msg <commit-message-file>');
      process.exit(1);
    }

    const result = appendCommitSystemsLogEntry(messagePath);
    console.log(`Appended systems log entry for commit: ${result.context}`);
    return;
  }

  if (argv[0] === '--post-commit') {
    const commitRef = argv[1] ?? 'HEAD';
    const result = appendCommittedSystemsLogEntry(commitRef);
    console.log(`Appended systems log entry for commit: ${result.context}`);
    return;
  }

  const [contextArg, ...intentArgs] = argv;
  const context = (contextArg ?? '').trim();
  const intent = intentArgs.join(' ').trim();

  if (!context || !intent) {
    console.error('Usage: pnpm health-log "<context>" "<architectural intent>"');
    process.exit(1);
  }

  appendSystemsLogEntry({ context, intent });
  console.log(`Appended systems log entry for: ${context}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
