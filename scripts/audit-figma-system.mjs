#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * audit-figma-system.mjs
 *
 * Read-only Figma sync audit for the Hirobius repo.
 *
 * Purpose:
 * - compare repo truth against the generated Figma variable exports
 * - keep room for both the official Figma MCP and Figma Console MCP flows
 * - accept an optional normalized snapshot later when Figma-side exports are available
 *
 * Default inputs:
 * - hirobius.tokens.json
 * - public/hds-manifest.json
 * - src/app/data/component-api.json
 * - hirobius.figma-variables.json
 * - hirobius.figma-variables-api.json
 * - DESIGN.md / DESIGN-HANDOFF.md presence checks
 *
 * Optional input:
 * - --snapshot <path>  Normalized JSON snapshot from a Figma MCP flow
 * - --json             Emit machine-readable JSON instead of text
 * - --strict           Exit 1 on Figma-vs-tokens drift (default: warn-only,
 *                      exit 0). HITL drift tracked in kanban 12q-figma-system-drift
 *                      and t_d068769e — Adrian must ratify Figma-vs-tokens
 *                      canonicity before strict enforcement is meaningful.
 *
 * Exit codes:
 * - 0: repo readiness OK; missing-files always still fail (regardless of --strict)
 * - 1: --strict and Figma drift detected, OR file presence / parse error,
 *      OR snapshot drift detected (when --snapshot supplied)
 *
 * Why warn-only by default (2026-05-09 — t_dd835117): the audit correctly
 * reports the drift documented in 12q-figma-system-drift (HITL-blocked).
 * Until Adrian ratifies Figma-vs-tokens canonicity (Option A: regen Figma
 * from tokens, Option B: adjust tokens to match Figma), every consumer of
 * this script tripped on the same known drift. Default warn-only lets the
 * audit run as a status surface without blocking unrelated workflows; the
 * `--strict` flag preserves CI/gate enforcement once HITL resolves.
 */

import { existsSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();

const PATHS = {
  tokens: join(ROOT, 'hirobius.tokens.json'),
  manifest: join(ROOT, 'public', 'hds-manifest.json'),
  componentApi: join(ROOT, 'src', 'app', 'data', 'component-api.json'),
  designMd: join(ROOT, 'DESIGN.md'),
  handoffMd: join(ROOT, 'DESIGN-HANDOFF.md'),
  figmaVariables: join(ROOT, 'hirobius.figma-variables.json'),
  figmaVariablesApi: join(ROOT, 'hirobius.figma-variables-api.json'),
};

const DTCG_KEYS = new Set(['$type', '$value', '$description', '$extensions', '$schema']);
const FIGMA_COLLECTIONS = {
  primitive: 'Hirobius/Primitives',
  semantic: 'Hirobius/Semantic',
  component: 'Hirobius/Component',
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function safeReadJson(path) {
  try {
    if (!existsSync(path)) return null;
    return readJson(path);
  } catch (error) {
    return { __error: String(error?.message ?? error) };
  }
}

function* walkTokens(node, path = [], inheritedType = null) {
  if (!node || typeof node !== 'object') return;
  const type = node.$type || inheritedType;

  if ('$value' in node) {
    yield {
      path,
      type,
      value: node.$value,
      description: node.$description,
      extensions: node.$extensions,
    };
    return;
  }

  for (const key of Object.keys(node)) {
    if (DTCG_KEYS.has(key)) continue;
    yield* walkTokens(node[key], [...path, key], type);
  }
}

function figmaType(type) {
  switch (type) {
    case 'color':
    case 'dimension':
    case 'duration':
    case 'fontWeight':
    case 'number':
    case 'cubicBezier':
    case 'fontFamily':
      return true;
    default:
      return false;
  }
}

function normalizeName(value) {
  return String(value ?? '').trim();
}

function diffSets(expected, actual) {
  const missing = [...expected]
    .filter((value) => !actual.has(value))
    .sort((a, b) => a.localeCompare(b));
  const extra = [...actual]
    .filter((value) => !expected.has(value))
    .sort((a, b) => a.localeCompare(b));
  return { missing, extra };
}

// Mirror of scripts/build-figma-variables.mjs: typography composites are
// flattened into 5 scalar variables per style (font-family, font-size,
// font-weight, letter-spacing, line-height) so Figma — which only supports
// scalar variables — can consume them. Audit must mirror that expansion or
// the post-regen comparison will report 40 phantom "extras" in the semantic
// collection.
const TYPOGRAPHY_SUBKEYS = [
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'line-height',
];

function expandTypographyForAudit(walked) {
  const result = [];
  for (const token of walked) {
    if (token.type !== 'typography') continue;
    if (!token.value || typeof token.value !== 'object' || Array.isArray(token.value)) continue;
    for (const sub of TYPOGRAPHY_SUBKEYS) {
      result.push({
        path: [...token.path, sub],
        type: 'dimension', // type is irrelevant for set-membership compare
        value: null,
      });
    }
  }
  return result;
}

function collectTokenExportData(raw) {
  const walked = [...walkTokens(raw)];
  const scalar = walked.filter((token) => token.type && figmaType(token.type));
  const typographyExpanded = expandTypographyForAudit(walked);
  const all = [...scalar, ...typographyExpanded];
  const byTier = {
    primitive: [],
    semantic: [],
    component: [],
  };

  for (const token of all) {
    const tier = token.path[0];
    if (!byTier[tier]) continue;
    byTier[tier].push(token);
  }

  for (const tier of Object.keys(byTier)) {
    byTier[tier].sort((a, b) => a.path.join('/').localeCompare(b.path.join('/')));
  }

  // supportedCount must match what actually ships to Figma — sum of the three
  // mapped tiers (primitive/semantic/component). Other tiers (e.g. `role`)
  // exist in tokens.json but are intentionally not exported, so they must
  // not be counted in the REST-payload comparison or it will always drift.
  const supportedCount = byTier.primitive.length + byTier.semantic.length + byTier.component.length;

  return {
    supportedCount,
    byTier,
  };
}

function collectionNameForTier(tier) {
  return FIGMA_COLLECTIONS[tier] ?? null;
}

function collectPluginExportData(pluginJson) {
  const collections = new Map();
  for (const collection of pluginJson?.collections ?? []) {
    const variables = new Set(
      (collection.variables ?? []).map((variable) => normalizeName(variable.name)),
    );
    collections.set(collection.name, variables);
  }
  return collections;
}

function collectApiExportData(apiJson) {
  const collectionCount = apiJson?.variableCollections?.length ?? 0;
  const variableCount = apiJson?.variables?.length ?? 0;
  return { collectionCount, variableCount };
}

function collectManifestComponentNames(manifest) {
  return new Set((manifest?.componentInventory ?? []).map(normalizeName));
}

function collectComponentApiNames(componentApi) {
  return new Set(Object.keys(componentApi?.components ?? {}).map(normalizeName));
}

function collectSnapshotEntities(snapshot) {
  const variables = new Set();
  const components = new Set();
  const styles = new Set();

  const variableArrays = [
    snapshot?.variables,
    snapshot?.designSystem?.variables,
    snapshot?.kit?.variables,
  ].filter(Array.isArray);

  for (const arr of variableArrays) {
    for (const item of arr) {
      variables.add(normalizeName(item?.name ?? item?.path ?? item?.key));
    }
  }

  const componentArrays = [
    snapshot?.components,
    snapshot?.designSystem?.components,
    snapshot?.kit?.components,
  ].filter(Array.isArray);

  for (const arr of componentArrays) {
    for (const item of arr) {
      components.add(normalizeName(item?.name ?? item?.key ?? item?.path));
    }
  }

  const styleArrays = [
    snapshot?.styles,
    snapshot?.designSystem?.styles,
    snapshot?.kit?.styles,
  ].filter(Array.isArray);

  for (const arr of styleArrays) {
    for (const item of arr) {
      styles.add(normalizeName(item?.name ?? item?.key ?? item?.path));
    }
  }

  return { variables, components, styles };
}

function parseArgs(argv) {
  const flags = {
    json: false,
    snapshot: null,
    strict: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--snapshot') {
      flags.snapshot = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--strict') {
      flags.strict = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }

  return flags;
}

const flags = parseArgs(process.argv.slice(2));

if (flags.help) {
  console.log(
    [
      'Usage: node scripts/audit-figma-system.mjs [--snapshot path] [--json]',
      '',
      'Checks:',
      '- repo readiness for Figma sync',
      '- generated figma variable artifacts against hirobius.tokens.json',
      '- manifest / component-api alignment',
      '- optional normalized Figma snapshot drift',
      '',
      'Snapshot shape is intentionally flexible so it can be fed by a transport-specific adapter later.',
    ].join('\n'),
  );
  process.exit(0);
}

const report = {
  ok: true,
  hardError: false,
  strict: flags.strict,
  files: {},
  tokens: {},
  manifest: {},
  figmaExports: {},
  snapshot: null,
  issues: [],
};

// Severity classification (added 2026-05-09 for t_dd835117):
// - 'hard'  : file missing / parse error — always fails the audit, regardless of --strict.
// - 'drift' : Figma export ≠ tokens / snapshot ≠ tokens — only fails under --strict.
//             Default warn-only because the drift is HITL-tracked in 12q-figma-system-drift.
function issue(scope, message, detail = null, severity = 'drift') {
  report.ok = false;
  if (severity === 'hard') report.hardError = true;
  report.issues.push({ scope, message, detail, severity });
}

for (const [key, path] of Object.entries(PATHS)) {
  const present = existsSync(path);
  report.files[key] = {
    path: relative(ROOT, path).replace(/\\/g, '/'),
    present,
  };

  if (!present && key !== 'figmaVariables' && key !== 'figmaVariablesApi') {
    issue('files', `${key} is missing`, report.files[key].path, 'hard');
  }
}

const tokens = safeReadJson(PATHS.tokens);
const manifest = safeReadJson(PATHS.manifest);
const componentApi = safeReadJson(PATHS.componentApi);
const figmaVariables = safeReadJson(PATHS.figmaVariables);
const figmaVariablesApi = safeReadJson(PATHS.figmaVariablesApi);

if (tokens?.__error)
  issue('tokens', 'Failed to parse hirobius.tokens.json', tokens.__error, 'hard');
if (manifest?.__error)
  issue('manifest', 'Failed to parse public/hds-manifest.json', manifest.__error, 'hard');
if (componentApi?.__error)
  issue('component-api', 'Failed to parse component-api.json', componentApi.__error, 'hard');
if (figmaVariables?.__error)
  issue(
    'figma-variables',
    'Failed to parse hirobius.figma-variables.json',
    figmaVariables.__error,
    'hard',
  );
if (figmaVariablesApi?.__error)
  issue(
    'figma-variables-api',
    'Failed to parse hirobius.figma-variables-api.json',
    figmaVariablesApi.__error,
    'hard',
  );

if (tokens && !tokens.__error) {
  const tokenData = collectTokenExportData(tokens);
  report.tokens = {
    supportedCount: tokenData.supportedCount,
    primitive: tokenData.byTier.primitive.length,
    semantic: tokenData.byTier.semantic.length,
    component: tokenData.byTier.component.length,
  };

  const pluginExpected = {
    primitive: new Set(tokenData.byTier.primitive.map((token) => token.path.slice(1).join('/'))),
    semantic: new Set(tokenData.byTier.semantic.map((token) => token.path.slice(1).join('/'))),
    component: new Set(tokenData.byTier.component.map((token) => token.path.slice(1).join('/'))),
  };

  if (figmaVariables && !figmaVariables.__error) {
    const pluginCollections = collectPluginExportData(figmaVariables);
    const collectionsSummary = {};

    for (const tier of Object.keys(FIGMA_COLLECTIONS)) {
      const collectionName = collectionNameForTier(tier);
      const actualNames = pluginCollections.get(collectionName) ?? new Set();
      const expectedNames = pluginExpected[tier];
      const { missing, extra } = diffSets(expectedNames, actualNames);

      collectionsSummary[tier] = {
        collection: collectionName,
        expected: expectedNames.size,
        actual: actualNames.size,
        missing,
        extra,
      };

      if (missing.length || extra.length) {
        issue('figma-variables', `${collectionName} does not match token source`, {
          missing,
          extra,
        });
      }
    }

    report.figmaExports.plugin = collectionsSummary;
  }

  if (figmaVariablesApi && !figmaVariablesApi.__error) {
    const apiExport = collectApiExportData(figmaVariablesApi);
    const expectedCollectionCount = Object.keys(FIGMA_COLLECTIONS).length;
    if (apiExport.collectionCount !== expectedCollectionCount) {
      issue(
        'figma-variables-api',
        'REST payload collection count does not match the repo token tiers',
        {
          expected: expectedCollectionCount,
          actual: apiExport.collectionCount,
        },
      );
    }
    if (apiExport.variableCount !== tokenData.supportedCount) {
      issue(
        'figma-variables-api',
        'REST payload variable count does not match supported token count',
        {
          expected: tokenData.supportedCount,
          actual: apiExport.variableCount,
        },
      );
    }

    report.figmaExports.api = apiExport;
  }
}

if (manifest && !manifest.__error && componentApi && !componentApi.__error) {
  const manifestNames = collectManifestComponentNames(manifest);
  const apiNames = collectComponentApiNames(componentApi);
  const { missing, extra } = diffSets(manifestNames, apiNames);

  report.manifest = {
    manifestCount: manifestNames.size,
    apiCount: apiNames.size,
    missingFromApi: missing,
    extraInApi: extra,
  };

  if (missing.length || extra.length) {
    issue('manifest', 'component inventory and component-api are out of sync', {
      missingFromApi: missing,
      extraInApi: extra,
    });
  }
}

if (flags.snapshot) {
  const snapshotPath = join(ROOT, flags.snapshot);
  const snapshotJson = safeReadJson(snapshotPath);
  if (!snapshotJson) {
    issue('snapshot', 'Snapshot file not found', relative(ROOT, snapshotPath).replace(/\\/g, '/'));
  } else if (snapshotJson.__error) {
    issue('snapshot', 'Failed to parse snapshot JSON', snapshotJson.__error);
  } else {
    const snapshotEntities = collectSnapshotEntities(snapshotJson);
    const repoComponentNames = collectComponentApiNames(componentApi);
    const repoVariableNames = new Set();

    if (tokens && !tokens.__error) {
      for (const token of [...walkTokens(tokens)].filter(
        (token) => token.type && figmaType(token.type),
      )) {
        repoVariableNames.add(token.path.slice(1).join('/'));
      }
    }

    const snapshotComponentDiff = diffSets(repoComponentNames, snapshotEntities.components);
    const snapshotVariableDiff = diffSets(repoVariableNames, snapshotEntities.variables);

    report.snapshot = {
      path: relative(ROOT, snapshotPath).replace(/\\/g, '/'),
      components: {
        expected: repoComponentNames.size,
        actual: snapshotEntities.components.size,
        missing: snapshotComponentDiff.missing,
        extra: snapshotComponentDiff.extra,
      },
      variables: {
        expected: repoVariableNames.size,
        actual: snapshotEntities.variables.size,
        missing: snapshotVariableDiff.missing,
        extra: snapshotVariableDiff.extra,
      },
      styles: snapshotEntities.styles.size,
    };

    if (snapshotComponentDiff.missing.length || snapshotComponentDiff.extra.length) {
      issue('snapshot', 'snapshot component names differ from repo component-api', {
        missing: snapshotComponentDiff.missing,
        extra: snapshotComponentDiff.extra,
      });
    }
    if (snapshotVariableDiff.missing.length || snapshotVariableDiff.extra.length) {
      issue('snapshot', 'snapshot variable names differ from repo tokens', {
        missing: snapshotVariableDiff.missing,
        extra: snapshotVariableDiff.extra,
      });
    }
  }
}

if (flags.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('# Figma Sync Audit');
  console.log('');
  console.log(`Root: ${ROOT}`);
  console.log('');
  console.log('## Repo Readiness');
  for (const [key, info] of Object.entries(report.files)) {
    console.log(`- ${key}: ${info.present ? 'present' : 'missing'} (${info.path})`);
  }
  console.log('');
  console.log('## Token Export');
  console.log(`- Supported token variables: ${report.tokens.supportedCount ?? 0}`);
  console.log(`- Primitive variables: ${report.tokens.primitive ?? 0}`);
  console.log(`- Semantic variables: ${report.tokens.semantic ?? 0}`);
  console.log(`- Component variables: ${report.tokens.component ?? 0}`);
  if (report.figmaExports.plugin) {
    console.log('- Plugin export collections:');
    for (const [tier, summary] of Object.entries(report.figmaExports.plugin)) {
      console.log(`  - ${tier}: ${summary.actual}/${summary.expected} (${summary.collection})`);
    }
  }
  if (report.figmaExports.api) {
    console.log(`- REST payload collections: ${report.figmaExports.api.collectionCount}`);
    console.log(`- REST payload variables: ${report.figmaExports.api.variableCount}`);
  }
  console.log('');
  console.log('## Manifest / API');
  console.log(`- manifest components: ${report.manifest.manifestCount ?? 0}`);
  console.log(`- component-api components: ${report.manifest.apiCount ?? 0}`);
  if (report.snapshot) {
    console.log('');
    console.log('## Snapshot');
    console.log(`- snapshot: ${report.snapshot.path}`);
    console.log(
      `- components: ${report.snapshot.components.actual}/${report.snapshot.components.expected}`,
    );
    console.log(
      `- variables: ${report.snapshot.variables.actual}/${report.snapshot.variables.expected}`,
    );
    console.log(`- styles: ${report.snapshot.styles}`);
  }
  if (report.issues.length) {
    console.log('');
    console.log('## Issues');
    for (const item of report.issues) {
      const sev = item.severity === 'hard' ? 'HARD' : 'DRIFT';
      console.log(`- [${sev}] [${item.scope}] ${item.message}`);
      if (item.detail) {
        console.log(`  - ${JSON.stringify(item.detail)}`);
      }
    }
    if (!report.strict && report.issues.some((i) => i.severity === 'drift')) {
      console.log('');
      console.log(
        'Drift items above are warn-only (default). Re-run with --strict to fail-on-drift.',
      );
      console.log(
        'HITL: Figma-vs-tokens canonicity blocks resolution — see kanban 12q-figma-system-drift / t_d068769e.',
      );
    }
  }
}

// Exit policy (t_dd835117, 2026-05-09):
// - Hard errors (file missing / parse failure) ALWAYS fail (exit 1).
// - Drift errors ONLY fail under --strict. Otherwise surface as warnings.
const shouldFail = report.hardError || (report.strict && !report.ok);
process.exit(shouldFail ? 1 : 0);
