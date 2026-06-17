#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * sync-system-health.mjs
 *
 * Reads the latest generated system artifacts, synchronizes health telemetry
 * into public/hds-manifest.json, records history when the score changes, and only
 * appends to the systems log when the manifest-backed state actually changes.
 *
 * This script is intentionally pure. Generation and audit refresh steps happen
 * in the package script before this file runs.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import { discoverHdsComponents } from './component-discovery.mjs';
import { writeManifest as writeComponentApiManifest } from './generate-component-api.mjs';
import { generateLlmsTxt } from './generate-llms-txt.mjs';
import { runDimensionCheck } from './check-dimensions.mjs';
import { runComponentDocsCheck } from './lib/check-component-docs.mjs';
import { runRegistryCheck } from './check-registry.mjs';
import { appendSystemsLogEntry } from './update-journal.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const MANIFEST_PATH = join(ROOT, 'public', 'hds-manifest.json');
const PACKAGE_PATH = join(ROOT, 'package.json');
const REPORT_PATH = join(ROOT, 'src', 'app', 'data', 'token-audit-report.json');
const HISTORY_PATH = join(ROOT, 'src', 'app', 'data', 'health-history.json');
const ROOT_LLMS_PATH = join(ROOT, 'llms.txt');
const PUBLIC_LLMS_PATH = join(ROOT, 'public', 'llms.txt');
const ROOT_CLAUDE_PATH = join(ROOT, 'CLAUDE.md');
const CLAUDE_CONFIG_PATH = join(ROOT, 'claude-config', 'CLAUDE.md');
const AGENT_CONTEXT_PATH = join(ROOT, 'AGENT_CONTEXT_SYSTEM.md');
const COMPONENT_DOC_PAGE_PATH = join(ROOT, 'src', 'app', 'components', 'ComponentDocPage.tsx');
const DOC_PRIMITIVES_PATH = join(ROOT, 'src', 'app', 'pages', 'hds', 'HdsDocPrimitives.tsx');
const REFLECTIVE_TOKEN_TABLE_PATH = join(ROOT, 'src', 'app', 'components', 'ReflectiveTokenTable.tsx');
const TEXT_LOCKUP_PATH = join(ROOT, 'src', 'app', 'components', 'TextLockup.tsx');
const PATTERNS_PAGE_PATH = join(ROOT, 'src', 'app', 'pages', 'hds', 'PatternsPage.tsx');
const DIST_ENTRY_PATH = join(ROOT, 'src', 'index.ts');
const LIB_CONFIG_PATH = join(ROOT, 'vite.config.lib.ts');
const PUBLIC_MANIFEST_PATH = join(ROOT, 'public', 'hds-manifest.json');
const PHASE_PANEL_PATH = join(ROOT, 'src', 'app', 'pages', 'hds', 'PhaseProgressPanel.tsx');
const COMPONENT_DOC_PAGES_DIR = join(ROOT, 'src', 'app', 'pages', 'hds', 'components');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizeHealthState(health) {
  if (!health) return null;
  return {
    ...health,
    generatedAt: undefined,
  };
}

function fileText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function fileExists(path) {
  return existsSync(path);
}

function countOccurrences(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

function countCodeConnectRefs() {
  const candidateFiles = [PHASE_PANEL_PATH, PUBLIC_MANIFEST_PATH];

  return candidateFiles.reduce((count, path) => {
    if (!existsSync(path)) return count;
    const text = readFileSync(path, 'utf8');
    return count + (text.match(/Code Connect|codeConnect|code connect/g) ?? []).length;
  }, 0);
}

function summarizeCriticalFiles(violations) {
  const byFile = new Map();

  for (const entry of violations ?? []) {
    byFile.set(entry.file, (byFile.get(entry.file) ?? 0) + 1);
  }

  return [...byFile.entries()]
    .map(([file, count]) => ({
      file,
      count,
      label: file.split(/[\\/]/).pop() ?? file,
    }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
    .slice(0, 3);
}

function buildSparklineValues(history) {
  const values = history.map((entry) => entry.score);
  const max = Math.max(100, ...values);

  return values.slice(-24).map((value) => Math.max(6, Math.round((value / max) * 24)));
}

function formatTrend(delta) {
  if (delta === null) return 'baseline';
  if (delta === 0) return '0';
  const prefix = delta > 0 ? '+' : '-';
  return `${prefix}${Math.abs(delta)}`;
}

function deriveHonestGrade(score, totalViolations) {
  if (totalViolations === 0) {
    if (score >= 97) return 'A';
    if (score >= 90) return 'B';
    if (score >= 80) return 'C';
    if (score >= 70) return 'D';
    return 'F';
  }

  if (totalViolations <= 5) return 'B';
  if (totalViolations <= 15) return 'C';
  if (totalViolations <= 30) return 'D';
  return 'F';
}

function capGrade(currentGrade, maxGrade) {
  const gradeOrder = ['A', 'B', 'C', 'D', 'F'];
  const currentIndex = gradeOrder.indexOf(currentGrade);
  const maxIndex = gradeOrder.indexOf(maxGrade);

  if (currentIndex === -1 || maxIndex === -1) return currentGrade;
  return gradeOrder[Math.max(currentIndex, maxIndex)];
}

function collectComponentApiCoverage(componentApi, manifest) {
  const componentNames = discoverHdsComponents().components
    .filter((component) => !component.ignored)
    .filter((component) => component.tier === 'primitive' || component.tier === 'pattern')
    .filter((component) => !(manifest.componentSpecs?.[component.name]?.hidden))
    .map((component) => component.name);
  const documented = componentNames.filter((name) => Boolean(componentApi[name]));

  return {
    documented: documented.length,
    total: componentNames.length,
    percent: componentNames.length > 0 ? Math.round((documented.length / componentNames.length) * 100) : 0,
  };
}

function collectUncategorizedComponents(manifest) {
  return manifest.inventory?.uncategorized ?? [];
}

function collectTextLockupStats() {
  const files = [
    COMPONENT_DOC_PAGE_PATH,
    DOC_PRIMITIVES_PATH,
    PATTERNS_PAGE_PATH,
    ...readdirSync(COMPONENT_DOC_PAGES_DIR)
      .filter((entry) => entry.endsWith('.tsx'))
      .map((entry) => join(COMPONENT_DOC_PAGES_DIR, entry)),
  ];

  const totalInstances = files.reduce((sum, path) => {
    if (!existsSync(path)) return sum;
    return sum + countOccurrences(readFileSync(path, 'utf8'), /<TextLockup\b/g);
  }, 0);

  return {
    totalInstances,
    patternExists: existsSync(TEXT_LOCKUP_PATH),
  };
}

function snapshotFromAudit(report) {
  const totalViolations = [
    report.counts?.ghostComponentVars ?? 0,
    report.counts?.themeForbiddenOverrides ?? 0,
    report.counts?.inlineStyleViolations ?? 0,
    report.counts?.semanticMappingViolations ?? 0,
    report.counts?.forbiddenOverrides ?? 0,
  ].reduce((sum, count) => sum + count, 0);

  return {
    recordedAt: report.generatedAt,
    generatedAt: report.generatedAt,
    score: report.integrity?.score ?? 0,
    grade: deriveHonestGrade(report.integrity?.score ?? 0, totalViolations),
    totalViolations,
    counts: {
      ghostComponentVars: report.counts?.ghostComponentVars ?? 0,
      themeForbiddenOverrides: report.counts?.themeForbiddenOverrides ?? 0,
      inlineStyleViolations: report.counts?.inlineStyleViolations ?? 0,
      semanticMappingViolations: report.counts?.semanticMappingViolations ?? 0,
      forbiddenOverrides: report.counts?.forbiddenOverrides ?? 0,
    },
  };
}

function getJsxTagName(node) {
  if (!node) return null;
  const tagName = node.tagName;
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return null;
}

function isRenderableJsxChild(node) {
  if (ts.isJsxText(node)) {
    return node.getText().trim().length > 0;
  }

  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node) || ts.isJsxExpression(node);
}

function isManualLayoutSibling(node) {
  if (ts.isJsxElement(node)) {
    const tagName = getJsxTagName(node.openingElement);
    return tagName === 'div' || tagName === 'p';
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const tagName = getJsxTagName(node);
    return tagName === 'div' || tagName === 'p';
  }

  return false;
}

function topLevelJsxChildren(sectionNode) {
  return sectionNode.children.filter(isRenderableJsxChild);
}

function hasComponentDocChild(children) {
  return children.some((child) => {
    if (ts.isJsxElement(child)) {
      return getJsxTagName(child.openingElement) === 'HdsComponentDoc';
    }

    if (ts.isJsxSelfClosingElement(child)) {
      return getJsxTagName(child) === 'HdsComponentDoc';
    }

    return false;
  });
}

function collectStorefrontViolations(sourceFile) {
  const violations = [];

  function visit(node) {
    if (ts.isJsxElement(node) && getJsxTagName(node.openingElement) === 'DocSection') {
      const children = topLevelJsxChildren(node);

      if (hasComponentDocChild(children)) {
        for (const child of children) {
          if (!isManualLayoutSibling(child)) continue;
          const start = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile));
          violations.push({
            file: sourceFile.fileName,
            line: start.line + 1,
            tag: ts.isJsxElement(child) ? getJsxTagName(child.openingElement) : getJsxTagName(child),
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function runStorefrontGovernanceAudit() {
  const files = readdirSync(COMPONENT_DOC_PAGES_DIR)
    .filter((entry) => entry.endsWith('.tsx'))
    .map((entry) => join(COMPONENT_DOC_PAGES_DIR, entry));

  const violations = files.flatMap((path) => {
    const source = readFileSync(path, 'utf8');
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return collectStorefrontViolations(sourceFile);
  });

  return {
    ok: violations.length === 0,
    violations,
  };
}

function appendHistoryIfChanged(history, currentSnapshot) {
  const nextHistory = Array.isArray(history) ? history.slice() : [];
  const latest = nextHistory[nextHistory.length - 1] ?? null;

  const changed = !latest
    || latest.score !== currentSnapshot.score
    || latest.grade !== currentSnapshot.grade
    || latest.totalViolations !== currentSnapshot.totalViolations;

  if (changed) {
    nextHistory.push(currentSnapshot);
  }

  const latestSnapshot = changed ? currentSnapshot : latest ?? currentSnapshot;
  const previousDistinct = [...nextHistory]
    .slice(0, changed ? -1 : undefined)
    .reverse()
    .find((entry) =>
      entry.score !== latestSnapshot.score
      || entry.grade !== latestSnapshot.grade
      || entry.totalViolations !== latestSnapshot.totalViolations,
    ) ?? null;

  return {
    changed,
    nextHistory,
    latestSnapshot,
    previousDistinct,
  };
}

function criterionState(targetState) {
  if (targetState === 'done') return { done: true };
  if (targetState === 'partial') return { done: false, partial: true };
  return { done: false };
}

function phaseById(manifest, id) {
  return manifest.phases?.find((phase) => phase.id === id);
}

function applyCriterion(phase, label, state) {
  const criterion = phase.criteria?.find((entry) => entry.label === label);
  if (!criterion) return;
  const next = criterionState(state);
  criterion.done = next.done;
  if (next.partial) criterion.partial = true;
  else delete criterion.partial;
}

function boolToState(value) {
  return value ? 'done' : 'todo';
}

function setIfPresent(manifest, phaseId, criterionLabel, state) {
  const phase = phaseById(manifest, phaseId);
  if (!phase) return;
  applyCriterion(phase, criterionLabel, state);
}

function buildSyncIntent(historyState) {
  const curr = historyState.latestSnapshot;
  const prev = historyState.previousDistinct;
  const parts = [];

  if (prev) {
    const violDelta = curr.totalViolations - prev.totalViolations;
    const scoreDelta = curr.score - prev.score;

    if (violDelta < 0) {
      parts.push(`Resolved ${Math.abs(violDelta)} violation${Math.abs(violDelta) !== 1 ? 's' : ''}`);
    } else if (violDelta > 0) {
      parts.push(`Detected ${violDelta} new violation${violDelta !== 1 ? 's' : ''}`);
    }

    if (scoreDelta > 0) {
      parts.push(`integrity improved to ${curr.grade} (${curr.score}%)`);
    } else if (scoreDelta < 0) {
      parts.push(`integrity dropped to ${curr.grade} (${curr.score}%)`);
    }
  } else {
    parts.push(`Baseline established at ${curr.grade} (${curr.score}%) with ${curr.totalViolations} violation${curr.totalViolations !== 1 ? 's' : ''}`);
  }

  parts.push('manifest telemetry, phase progress, and LLMS context updated to reflect current system state');

  return `${parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join('; ')}.`;
}

export function syncSystemHealth() {
  const manifestBefore = readJson(MANIFEST_PATH);
  const healthBefore = JSON.stringify(normalizeHealthState(manifestBefore.health ?? null));
  const phasesBefore = JSON.stringify(manifestBefore.phases ?? []);

  const pkg = readJson(PACKAGE_PATH);
  const report = readJson(REPORT_PATH);
  const history = readJson(HISTORY_PATH);
  const componentApiManifest = writeComponentApiManifest();
  const dimensionsResult = runDimensionCheck();
  const docsResult = runComponentDocsCheck();
  const registryResult = runRegistryCheck();
  const storefrontAudit = runStorefrontGovernanceAudit();

  const manifest = readJson(MANIFEST_PATH);
  const componentApi = componentApiManifest.components ?? {};
  const componentInventoryCount = manifest.componentInventory?.length ?? 0;
  const componentSpecCount = Object.keys(manifest.componentSpecs ?? {}).length;
  const componentApiCount = Object.keys(componentApi).length;
  const componentCoverage = collectComponentApiCoverage(componentApi, manifest);
  const uncategorizedComponents = collectUncategorizedComponents(manifest);
  const namespaceViolations = manifest.inventory?.namespaceViolations ?? [];
  const textLockupStats = collectTextLockupStats();

  const currentSnapshot = snapshotFromAudit(report);
  const totalViolations = currentSnapshot.totalViolations
    + storefrontAudit.violations.length
    + uncategorizedComponents.length
    + namespaceViolations.length;
  currentSnapshot.totalViolations = totalViolations;
  currentSnapshot.grade = deriveHonestGrade(currentSnapshot.score, totalViolations);
  if (docsResult.fidelity?.grade && docsResult.fidelity.grade !== 'A') {
    currentSnapshot.grade = capGrade(currentSnapshot.grade, 'B');
  }
  const historyState = appendHistoryIfChanged(history, currentSnapshot);
  if (historyState.changed) {
    writeJson(HISTORY_PATH, historyState.nextHistory);
  }

  const codeConnectRefs = countCodeConnectRefs();
  const topViolators = summarizeCriticalFiles(report.semanticMappingViolations ?? []);
  const trendDelta = historyState.previousDistinct
    ? currentSnapshot.totalViolations - historyState.previousDistinct.totalViolations
    : null;

  const componentDocPageText = fileText(COMPONENT_DOC_PAGE_PATH);
  const docPrimitivesText = fileText(DOC_PRIMITIVES_PATH);
  const hasRepoAgentDocs = fileExists(ROOT_CLAUDE_PATH);
  const hasWorkspaceRules = fileExists(CLAUDE_CONFIG_PATH) || fileExists(AGENT_CONTEXT_PATH);
  const hasTokenTableSurface =
    fileExists(REFLECTIVE_TOKEN_TABLE_PATH)
    || docPrimitivesText.includes('ReflectiveTokenTable');
  const hasApiTables =
    componentApiCount > 0
    && componentDocPageText.includes('Table')
    && docPrimitivesText.includes('Table');
  const hasLibraryBoundary =
    fileExists(DIST_ENTRY_PATH)
    && fileExists(LIB_CONFIG_PATH)
    && typeof pkg.main === 'string'
    && typeof pkg.module === 'string'
    && typeof pkg.exports?.['./dist/hirobius-ui.css'] === 'string';
  const repoSanitized =
    pkg.name === '@hirobius/design-system'
    && /Design Systems Architecture/.test(pkg.description ?? '')
    && /Design Systems Architecture/.test(manifest.name ?? '')
    && /Design Systems Architecture/.test(manifest.description ?? '');

  manifest.health = {
    generatedAt: report.generatedAt,
    integrity: {
      score: report.integrity?.score ?? currentSnapshot.score,
      grade: currentSnapshot.grade,
    },
    violations: {
      unmappedVariables: report.counts?.ghostComponentVars ?? 0,
      forbiddenOverrides: report.counts?.forbiddenOverrides ?? 0,
      directPrimitiveViolations: report.counts?.semanticMappingViolations ?? 0,
      storefrontGovernance: storefrontAudit.violations.length,
      uncategorizedComponents: uncategorizedComponents.length,
      namespaceViolations: namespaceViolations.length,
      total: totalViolations,
    },
    usage: {
      highBlastRadiusTokens: report.usageSummary?.highBlastRadius ?? report.counts?.semanticHighBlastRadius ?? 0,
      deadWood: report.usageSummary?.deadWood ?? report.counts?.semanticDeadWood ?? 0,
      maxBlastRadius: report.usageSummary?.maxBlastRadius ?? report.counts?.semanticMaxBlastRadius ?? 0,
      maxBlastRadiusToken: report.usageSummary?.maxBlastRadiusToken ?? null,
      textLockupsStandardized: textLockupStats.totalInstances,
    },
    componentCoverage: {
      documented: componentCoverage.documented,
      total: componentCoverage.total,
      percent: componentCoverage.percent,
      apiComponents: componentApiCount,
      specs: componentSpecCount,
    },
    fidelity: {
      grade: docsResult.fidelity.grade,
      complete: docsResult.fidelity.complete,
      total: docsResult.fidelity.total,
      percent: docsResult.fidelity.percent,
      incomplete: docsResult.fidelity.incomplete,
    },
    checks: {
      semanticReport: true,
      dimensions: dimensionsResult.ok,
      docsCoverage: docsResult.ok,
      docsFidelity: docsResult.fidelity.grade === 'A',
      registry: registryResult.ok,
      storefrontSchema: storefrontAudit.ok,
      categorization: uncategorizedComponents.length === 0,
      namespaceAudit: namespaceViolations.length === 0,
      textPattern: textLockupStats.patternExists && textLockupStats.totalInstances > 0,
      payloadAudit: typeof pkg.scripts?.['check:knip'] === 'string',
      llmsSync: false,
    },
    scanCleanup: {
      criticalFileCount: topViolators.length,
      criticalFiles: topViolators,
      trendDelta,
      trendLabel: formatTrend(trendDelta),
      lastScannedAt: historyState.latestSnapshot.recordedAt,
      sparklineValues: buildSparklineValues(historyState.nextHistory),
    },
  };

  setIfPresent(manifest, '1', 'W3C DTCG format', boolToState((manifest.systemSpecs?.tokens ?? '').includes('W3C')));
  setIfPresent(manifest, '1', 'Three-tier model', boolToState(true));
  setIfPresent(manifest, '1', 'Verify pipeline', boolToState(typeof pkg.scripts?.['tokens:verify'] === 'string'));
  setIfPresent(manifest, '1', 'Audit clean', boolToState(currentSnapshot.totalViolations === 0));

  setIfPresent(manifest, '2', 'Generated manifest', 'done');
  setIfPresent(manifest, '2', 'Inventory declared', boolToState(componentInventoryCount > 0));
  setIfPresent(
    manifest,
    '2',
    'System specs declared',
    boolToState(Boolean(manifest.systemSpecs?.engine && manifest.systemSpecs?.icons && manifest.systemSpecs?.tokens && manifest.systemSpecs?.styling)),
  );
  setIfPresent(
    manifest,
    '2',
    'Detailed specs coverage',
    componentSpecCount >= componentInventoryCount && componentInventoryCount > 0 ? 'done' : componentSpecCount > 0 ? 'partial' : 'todo',
  );

  setIfPresent(manifest, '3', 'Inventory shipped', boolToState(componentInventoryCount > 0));
  setIfPresent(
    manifest,
    '3',
    'Detailed specs coverage',
    componentSpecCount >= componentInventoryCount && componentInventoryCount > 0 ? 'done' : componentSpecCount > 0 ? 'partial' : 'todo',
  );
  setIfPresent(manifest, '3', 'Audit clean', boolToState(currentSnapshot.totalViolations === 0));
  setIfPresent(manifest, '3', 'Code Connect', boolToState(codeConnectRefs > 0));

  setIfPresent(manifest, '4.1a', 'Table grammar standardization', hasApiTables ? 'done' : 'partial');
  setIfPresent(manifest, '4.1a', 'Size-vs-space governance', boolToState(dimensionsResult.ok));
  setIfPresent(manifest, '4.1a', 'Library distribution boundary', boolToState(hasLibraryBoundary));
  setIfPresent(manifest, '4.1a', 'Repository sanitization', repoSanitized ? 'done' : 'partial');

  setIfPresent(manifest, '4.9', 'API tables', boolToState(hasApiTables));
  setIfPresent(manifest, '4.9', 'Token tables', boolToState(hasTokenTableSurface));
  setIfPresent(
    manifest,
    '4.9',
    'AST pipeline',
    docsResult.fidelity.percent === 100 ? 'done' : docsResult.fidelity.complete > 0 ? 'partial' : 'todo',
  );

  setIfPresent(manifest, '5', 'Token verify', boolToState(typeof pkg.scripts?.['tokens:verify'] === 'string'));
  setIfPresent(manifest, '5', 'Full audit gate', boolToState(typeof pkg.scripts?.['check:full'] === 'string'));
  setIfPresent(manifest, '5', 'Release gate', boolToState(typeof pkg.scripts?.['check:release'] === 'string'));
  setIfPresent(manifest, '5', 'A11y coverage', boolToState(typeof pkg.scripts?.['test:a11y'] === 'string'));
  setIfPresent(manifest, '5', 'Code Connect CI', boolToState(codeConnectRefs > 0));

  setIfPresent(manifest, '6', 'Repo agent docs', boolToState(hasRepoAgentDocs));
  setIfPresent(manifest, '6', 'Workspace rules', boolToState(hasWorkspaceRules));
  setIfPresent(manifest, '6', 'Manifest entry exists', boolToState(true));

  writeJson(MANIFEST_PATH, manifest);

  const generatedLlms = generateLlmsTxt();
  const rootLlms = fileText(ROOT_LLMS_PATH);
  const publicLlms = fileText(PUBLIC_LLMS_PATH);
  const hasPhaseSnapshot = generatedLlms.includes('## Phase Snapshot')
    && rootLlms.includes('## Phase Snapshot')
    && publicLlms.includes('## Phase Snapshot');
  const hasApiReference = generatedLlms.includes('## Component API Reference')
    && rootLlms.includes('## Component API Reference')
    && publicLlms.includes('## Component API Reference');

  manifest.health.checks.llmsSync = hasPhaseSnapshot && hasApiReference;
  setIfPresent(manifest, '4.9', 'LLMS sync', boolToState(hasPhaseSnapshot && hasApiReference));
  setIfPresent(manifest, '6', 'Manifest entry sync', boolToState(hasPhaseSnapshot && hasApiReference));

  writeJson(MANIFEST_PATH, manifest);

  const healthAfter = JSON.stringify(normalizeHealthState(manifest.health ?? null));
  const phasesAfter = JSON.stringify(manifest.phases ?? []);
  const stateChanged = healthBefore !== healthAfter || phasesBefore !== phasesAfter;

  if (stateChanged) {
    appendSystemsLogEntry({
      context: 'System Health Synchronization',
      intent: buildSyncIntent(historyState),
    });
  }

  return {
    stateChanged,
    manifest,
    dimensionsResult,
    docsResult,
    registryResult,
    storefrontAudit,
  };
}

export function main() {
  const result = syncSystemHealth();
  const { manifest } = result;

  console.log('OK sync-system-health - manifest health and measurable phase telemetry synchronized');
  console.log(`  System Integrity: ${manifest.health.integrity.grade} (${manifest.health.integrity.score}%)`);
  console.log(`  Direct Violations: ${manifest.health.violations.directPrimitiveViolations}`);
  console.log(`  Component Coverage: ${manifest.health.componentCoverage.documented}/${manifest.health.componentCoverage.total} (${manifest.health.componentCoverage.percent}%)`);
  console.log(`  Dimensions: ${result.dimensionsResult.violations.length} violation(s)`);
  console.log(`  Docs Coverage: ${result.docsResult.covered}/${result.docsResult.total}`);
  console.log(`  Fidelity Grade: ${result.manifest.health.fidelity.grade} (${result.manifest.health.fidelity.complete}/${result.manifest.health.fidelity.total})`);
  console.log(`  Registry Issues: ${result.registryResult.errors.length}`);
  console.log(`  Storefront Governance: ${result.storefrontAudit.violations.length} violation(s)`);
  console.log(`  Uncategorized Components: ${result.manifest.health.violations.uncategorizedComponents}`);
  console.log(`  Namespace Violations: ${result.manifest.health.violations.namespaceViolations}`);
  console.log(`  Systems Log Updated: ${result.stateChanged ? 'yes' : 'no'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
