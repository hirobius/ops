#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'src');
const COMPONENTS_DIR = join(ROOT, 'src', 'app', 'components');
const DOC_EXEMPT_PATTERN = /@doc-exempt:\s*(.+)/i;
const TAG_PATTERN = /@(category|internal|doc-ignore|figma|tier)\b(?:\s+([^\r\n*]+))?/g;
const TIER_VALUES = new Set(['primitive', 'pattern', 'template', 'utility']);

const SKIP_DIRS = new Set([
  '__tests__',
  'figma',
]);

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toRelativePath(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}

function collectTsxFiles(dir) {
  if (!existsSync(dir)) return [];

  const results = [];

  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...collectTsxFiles(fullPath));
      continue;
    }

    if (entry.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }

  return results;
}

function isExported(node) {
  return Boolean(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export);
}

function getExportedValueNames(sourceFile) {
  const exports = [];

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      exports.push(statement.name.text);
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
      exports.push(statement.name.text);
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exports.push(declaration.name.text);
        }
      }
    }
  }

  return exports;
}

function findJsDocBlock(source, exportName) {
  const escapedName = exportName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Prefer the JSDoc immediately above the actual component export. Only fall
  // back to the props-interface JSDoc if no component-level block exists.
  const exportPatterns = [
    new RegExp(`export\\s+const\\s+${escapedName}\\b`),
    new RegExp(`export\\s+function\\s+${escapedName}\\b`),
    new RegExp(`export\\s+default\\s+function\\s+${escapedName}\\b`),
    new RegExp(`export\\s+class\\s+${escapedName}\\b`),
    new RegExp(`export\\s+(?:interface|type)\\s+${escapedName}Props\\b`),
  ];

  for (const pattern of exportPatterns) {
    const exportMatch = source.match(pattern);
    if (!exportMatch) continue;
    const before = source.slice(0, exportMatch.index);
    const jsdocs = [...before.matchAll(/\/\*\*[\s\S]*?\*\//g)];
    if (jsdocs.length === 0) continue;
    const lastJsdoc = jsdocs[jsdocs.length - 1];
    const between = before.slice(lastJsdoc.index + lastJsdoc[0].length);
    if (/^\s*$/.test(between)) return lastJsdoc[0];
  }

  return '';
}

function findFileJsDocBlock(source) {
  const match = source.match(/^\s*\/\*\*[\s\S]*?\*\//);
  return match?.[0] ?? '';
}

function stripJsDocBlock(block) {
  return cleanText(
    block
      .replace(/^\/\*\*?/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .filter((line) => line && !line.startsWith('@'))
      .join(' '),
  );
}

function parseTags(block, source) {
  const tags = {
    category: null,
    internal: false,
    docIgnore: false,
    figmaUrl: null,
    docExempt: DOC_EXEMPT_PATTERN.test(source),
    tier: null,
  };

  if (!block) return tags;

  for (const match of block.matchAll(TAG_PATTERN)) {
    const [, key, value] = match;
    if (key === 'category') tags.category = cleanText(value);
    if (key === 'internal') tags.internal = true;
    if (key === 'doc-ignore') tags.docIgnore = true;
    if (key === 'figma') {
      const figmaCandidate = cleanText(value);
      if (/^(https?:\/\/|figma\.com\/)/i.test(figmaCandidate)) {
        tags.figmaUrl = figmaCandidate.startsWith('http') ? figmaCandidate : `https://${figmaCandidate}`;
      }
    }
    if (key === 'tier') {
      const candidate = cleanText(value).toLowerCase();
      if (TIER_VALUES.has(candidate)) tags.tier = candidate;
    }
  }

  return tags;
}

export function discoverHdsComponents() {
  const files = collectTsxFiles(SRC_DIR);
  const components = [];
  const namespaceViolations = [];

  for (const filePath of files) {
    const source = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const exportedNames = getExportedValueNames(sourceFile);

    if (exportedNames.length === 0) continue;

    const fileBlock = findFileJsDocBlock(source);
    const fileTags = parseTags(fileBlock, source);
    if (fileTags.docIgnore) continue;

    for (const name of exportedNames) {
      const componentBlock = findJsDocBlock(source, name);
      const componentTags = parseTags(componentBlock, source);
      const description = stripJsDocBlock(componentBlock) || stripJsDocBlock(fileBlock);
      const category = componentTags.category ?? fileTags.category ?? null;
      const internal = componentTags.internal || fileTags.internal;
      // @doc-ignore is a file-level "skip me" marker (not currently in use anywhere).
      // @doc-exempt is a component-level "no docs page" marker — the component is
      // still real (e.g. Card ships in GENERATIVE_SUBSET) and must surface in
      // the manifest so its tier and metadata can be governed. Callers that build
      // public-doc lists must filter on docExempt explicitly.
      const docIgnore = componentTags.docIgnore || fileTags.docIgnore;
      const docExempt = componentTags.docExempt || fileTags.docExempt;
      const figmaUrl = componentTags.figmaUrl ?? fileTags.figmaUrl ?? null;
      // Components are PascalCase identifiers with at least one lowercase letter.
      // Filters out exported constants (ALL_UPPERCASE) and exported helper
      // functions (camelCase / lowercase-start) that share a doc-exempt source file.
      const isComponentShapeName = /^[A-Z]/.test(name) && /[a-z]/.test(name);
      const shouldInclude = isComponentShapeName
        && (/^Hds[A-Z]/.test(name) || Boolean(category) || internal || docExempt);

      if (docIgnore) continue;

      if (filePath.startsWith(COMPONENTS_DIR) && !name.startsWith('Hds')) {
        namespaceViolations.push({
          name,
          filePath: toRelativePath(filePath),
        });
      }

      if (!shouldInclude) continue;

      const tier = componentTags.tier ?? fileTags.tier ?? null;

      components.push({
        name,
        filePath: toRelativePath(filePath),
        description,
        category,
        hidden: internal,
        ignored: false,
        docExempt,
        figmaUrl,
        tier,
        namespaceViolation: !name.startsWith('Hds'),
        tagState: docExempt ? 'doc-exempt' : internal ? 'internal' : category ? 'category' : 'uncategorized',
      });
    }
  }

  components.sort((a, b) => a.name.localeCompare(b.name) || a.filePath.localeCompare(b.filePath));
  namespaceViolations.sort((a, b) => a.name.localeCompare(b.name) || a.filePath.localeCompare(b.filePath));

  return {
    components,
    namespaceViolations,
  };
}
