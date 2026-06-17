#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-component-docs.mjs
 *
 * Documentation coverage gate for shared React components.
 * Every top-level component in src/app/components/*.tsx must be imported
 * in at least one HDS doc page unless it is explicitly exempted as an
 * internal utility.
 *
 * "A component that isn't documented doesn't exist in the DS."
 *
 * Usage: pnpm check:docs
 *
 * To mark a component as intentionally undocumented:
 * 1. Prefer adding a file-level comment near the top of the component:
 *      @doc-exempt: internal shell utility, not a consumer-facing HDS component
 * 2. Or add its filename to INTERNAL_COMPONENTS below for legacy exemptions.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import ts from 'typescript';
import { discoverHdsComponents } from '../component-discovery.mjs';

const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, 'public', 'hds-manifest.json');
const COMPONENT_API_PATH = join(ROOT, 'src', 'app', 'data', 'component-api.json');

const HDS_DOC_PAGES = [
  join(ROOT, 'src/app/pages/hds/ComponentsPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/ActionsPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/InputsPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/DisplayPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/FeedbackPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/MediaPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/NavigationPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/LayoutPage.tsx'),
  join(ROOT, 'src/app/pages/hds/components/DocUtilitiesPage.tsx'),
  join(ROOT, 'src/app/pages/hds/PatternsPage.tsx'),
  join(ROOT, 'src/app/components/DocSections.tsx'),
];

const CATEGORY_PAGE_BY_NAME = {
  Actions: join(ROOT, 'src/app/pages/hds/components/ActionsPage.tsx'),
  Inputs: join(ROOT, 'src/app/pages/hds/components/InputsPage.tsx'),
  Display: join(ROOT, 'src/app/pages/hds/components/DisplayPage.tsx'),
  Feedback: join(ROOT, 'src/app/pages/hds/components/FeedbackPage.tsx'),
  Navigation: join(ROOT, 'src/app/pages/hds/components/NavigationPage.tsx'),
  Layout: join(ROOT, 'src/app/pages/hds/components/LayoutPage.tsx'),
  Patterns: join(ROOT, 'src/app/pages/hds/PatternsPage.tsx'),
  Utilities: join(ROOT, 'src/app/pages/hds/components/DocUtilitiesPage.tsx'),
  Lab: join(ROOT, 'src/app/pages/hds/components/DocUtilitiesPage.tsx'),
  Branding: join(ROOT, 'src/app/pages/hds/components/DocUtilitiesPage.tsx'),
};

const INVENTORY_ONLY_CATEGORIES = new Set(['Utilities', 'Lab', 'Branding']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function getTagName(node) {
  if (!node) return null;
  const tagName = node.tagName;
  if (ts.isIdentifier(tagName)) return tagName.text;
  if (ts.isPropertyAccessExpression(tagName)) return tagName.name.text;
  return null;
}

function getJsxAttribute(node, name) {
  const attribute = node.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );

  if (!attribute) return null;
  return ts.isJsxAttribute(attribute) ? attribute : null;
}

function getStringLiteralAttributeValue(attribute) {
  if (!attribute?.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression && ts.isStringLiteral(attribute.initializer.expression)) {
    return attribute.initializer.expression.text;
  }
  return null;
}

function getIdentifierAttributeValue(attribute) {
  if (!attribute?.initializer) return null;
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression && ts.isIdentifier(attribute.initializer.expression)) {
    return attribute.initializer.expression.text;
  }
  return null;
}

function getObjectProperty(initializer, name) {
  if (!ts.isObjectLiteralExpression(initializer)) return null;
  const property = initializer.properties.find((entry) => {
    if (!ts.isPropertyAssignment(entry) && !ts.isShorthandPropertyAssignment(entry)) return false;
    if (ts.isIdentifier(entry.name)) return entry.name.text === name;
    if (ts.isStringLiteral(entry.name)) return entry.name.text === name;
    return false;
  });

  if (!property || !ts.isPropertyAssignment(property)) return null;
  return property;
}

function getObjectLiteralByIdentifier(sourceFile, identifierName) {
  let found = null;

  function visit(node) {
    if (found) return;

    let initializer = null;
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === identifierName
      && node.initializer
    ) {
      initializer = node.initializer;
      while (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))) {
        initializer = initializer.expression;
      }

      if (initializer && ts.isObjectLiteralExpression(initializer)) {
        found = initializer;
        return;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function collectPageDocSignals(path) {
  const text = readText(path);
  if (!text) {
    return {
      componentDocs: new Map(),
      categoryConfigs: new Map(),
    };
  }

  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const componentDocs = new Map();
  const categoryConfigs = new Map();

  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const openingElement = ts.isJsxElement(node) ? node.openingElement : node;
      const tagName = getTagName(openingElement);

      if (tagName === 'HdsComponentDoc' || tagName === 'ComponentDocPage') {
        const componentName = getStringLiteralAttributeValue(getJsxAttribute(openingElement, 'componentName'));
        if (componentName) {
          componentDocs.set(componentName, {
            hasPreview: true,
          });
        }
      }

      if (tagName === 'CategoryComponentDocs') {
        const category = getStringLiteralAttributeValue(getJsxAttribute(openingElement, 'category'));
        const configIdentifier = getIdentifierAttributeValue(getJsxAttribute(openingElement, 'configs'));

        if (category) {
          const perComponent = new Map();

          if (configIdentifier) {
            const configObject = getObjectLiteralByIdentifier(sourceFile, configIdentifier);

            if (configObject) {
              for (const property of configObject.properties) {
                if (!ts.isPropertyAssignment(property)) continue;
                const propertyName = ts.isIdentifier(property.name) ? property.name.text : ts.isStringLiteral(property.name) ? property.name.text : null;
                if (!propertyName || !ts.isObjectLiteralExpression(property.initializer)) continue;

                const layoutProp = getObjectProperty(property.initializer, 'layout');
                const layoutInitializer = layoutProp?.initializer;
                const layout = layoutInitializer && ts.isAsExpression(layoutInitializer)
                  ? ts.isStringLiteral(layoutInitializer.expression) ? layoutInitializer.expression.text : null
                  : layoutInitializer && ts.isStringLiteral(layoutInitializer) ? layoutInitializer.text : null;

                perComponent.set(propertyName, {
                  hasPreview: true,
                  layout: layout ?? 'default',
                });
              }
            }
          }

          categoryConfigs.set(category, perComponent);
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    componentDocs,
    categoryConfigs,
  };
}

function fidelityGrade(percent, missingCount) {
  if (missingCount === 0) return 'A';
  if (percent >= 85) return 'B';
  if (percent >= 70) return 'C';
  if (percent >= 50) return 'D';
  return 'F';
}

export function runComponentDocsCheck() {
  const manifest = readJson(MANIFEST_PATH);
  const componentApi = readJson(COMPONENT_API_PATH);
  const discoveredComponents = discoverHdsComponents().components
    .filter((component) => !component.ignored)
    .filter((component) => component.tier === 'primitive' || component.tier === 'pattern')
    .filter((component) => !(manifest.componentSpecs?.[component.name]?.hidden))
    .filter((component) => !component.docExempt);
  const pageSignals = new Map(HDS_DOC_PAGES.map((path) => [path, collectPageDocSignals(path)]));

  const undocumented = [];
  const missingSpecimens = [];
  const fidelityResults = [];

  for (const component of discoveredComponents) {
    const baseName = component.name;
    const file = component.filePath.split('/').pop() ?? `${baseName}.tsx`;
    const category = manifest.componentSpecs?.[baseName]?.category ?? component.category ?? null;
    const categoryPage = category ? CATEGORY_PAGE_BY_NAME[category] : null;
    const apiEntry = componentApi.components?.[baseName] ?? {};
    const observedTokens = apiEntry.observedTokens ?? [];
    const mappedTokens = Object.keys(manifest.componentSpecs?.[baseName]?.tokenMapping ?? {});
    const usesTokens = observedTokens.length > 0 || mappedTokens.length > 0;

    let hasPageEntry = false;
    const previewSpec = manifest.componentSpecs?.[baseName]?.preview;
    let hasPreview = Boolean(previewSpec?.exportName && previewSpec?.sizing);
    let layoutMode = 'default';

    for (const [, signals] of pageSignals) {
      const manualDoc = signals.componentDocs.get(baseName);
      if (manualDoc) {
        hasPageEntry = true;
      }
    }

    if (categoryPage) {
      const signals = pageSignals.get(categoryPage);
      const categoryConfig = signals?.categoryConfigs.get(category);
      if (categoryConfig) {
        hasPageEntry = true;
        const config = categoryConfig.get(baseName);
        if (config) {
          layoutMode = config.layout ?? layoutMode;
        } else {
          // CategoryComponentDocs auto-renders a default specimen when no manual
          // demo or matrix config is provided, so storefront coverage still has
          // a real preview surface.
          hasPreview = true;
        }
      }
    }

    if (!hasPageEntry) {
      undocumented.push(file);
    }

    const documentedProps = (apiEntry.props ?? []).filter((prop) => String(prop.description ?? '').trim().length > 0);
    const hasDocumentedProp = (apiEntry.props ?? []).length === 0 || documentedProps.length > 0;
    const requiresTokenTable = usesTokens && !INVENTORY_ONLY_CATEGORIES.has(category ?? '') && layoutMode !== 'utility';
    const hasTokenTable = !requiresTokenTable || hasPageEntry;
    const missing = [];

    if (!hasPreview) missing.push('preview metadata');
    if (!hasDocumentedProp) missing.push('documented props');
    if (!hasTokenTable) missing.push('token table');

    const publicStorefrontComponent = !INVENTORY_ONLY_CATEGORIES.has(category ?? '');
    if (publicStorefrontComponent) {
      if (!previewSpec) {
        missingSpecimens.push(baseName);
      }
      fidelityResults.push({
        name: baseName,
        filePath: component.filePath,
        category,
        hasPageEntry,
        hasPreview,
        hasDocumentedProp,
        usesTokens,
        hasTokenTable,
        missing,
        complete: hasPageEntry && missing.length === 0,
      });
    }
  }

  const total = discoveredComponents.length;
  const covered = total - undocumented.length;
  const fidelityTotal = fidelityResults.length;
  const fidelityComplete = fidelityResults.filter((component) => component.complete).length;
  const fidelityPercent = fidelityTotal > 0 ? Math.round((fidelityComplete / fidelityTotal) * 100) : 0;
  const fidelityIncomplete = fidelityResults.filter((component) => !component.complete);

  return {
    ok: undocumented.length === 0,
    total,
    covered,
    undocumented,
    missingSpecimens,
    fidelity: {
      total: fidelityTotal,
      complete: fidelityComplete,
      percent: fidelityPercent,
      grade: fidelityGrade(fidelityPercent, fidelityIncomplete.length),
      incomplete: fidelityIncomplete,
    },
  };
}

export function main() {
  const result = runComponentDocsCheck();

  if (result.ok) {
    if (result.missingSpecimens.length > 0) {
      console.error(`\nComponent docs check failed: ${result.missingSpecimens.length} component(s) missing preview metadata.\n`);
      console.error('  Every documented component needs preview metadata in public/hds-manifest.json.\n');
      for (const name of result.missingSpecimens) {
        console.error(`    - ${name}`);
      }
      console.error('');
      process.exit(1);
    }

    console.log(`\nComponent docs check passed: ${result.total}/${result.total} components documented and specimen-covered.\n`);
    process.exit(0);
  }

  console.error(`\nComponent docs check failed: ${result.undocumented.length} component(s) undocumented.\n`);
  console.error(`  ${result.covered}/${result.total} components have HDS doc page entries.\n`);
  console.error('  Each shared component needs one of these before it is considered done:\n');
  console.error('    1. A real HDS doc entry/import in:');
  console.error('       src/app/pages/hds/ComponentsPage.tsx');
  console.error('       src/app/pages/hds/components/*.tsx\n');
  console.error('    2. An explicit file-level exemption comment:');
  console.error('       @doc-exempt: <reason>\n');
  console.error('  Legacy exemptions may still be added to INTERNAL_COMPONENTS in');
  console.error('  scripts/check-component-docs.mjs.\n');

  for (const file of result.undocumented) {
    console.error(`    - ${file}`);
  }
  console.error('');

  if (result.missingSpecimens.length > 0) {
    console.error(`  Missing preview metadata: ${result.missingSpecimens.length}\n`);
    console.error('  Every documented component should expose preview metadata in public/hds-manifest.json:\n');
    for (const name of result.missingSpecimens) {
      console.error(`    - ${name}`);
    }
    console.error('');
  }

  console.error(`  Fidelity grade: ${result.fidelity.grade} (${result.fidelity.complete}/${result.fidelity.total}, ${result.fidelity.percent}%)\n`);

  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

