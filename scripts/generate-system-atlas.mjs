#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * generate-system-atlas.mjs
 *
 * Builds a text-ready markdown atlas of the HDS source graph for case-study
 * writing and future refactor planning.
 *
 * Scope:
 *   - src/app/components
 *   - src/app/layouts
 *   - src/app/pages/hds
 *
 * Output:
 *   - docs/SYSTEM_ATLAS.md
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_FILE = join(ROOT, 'docs', 'SYSTEM_ATLAS.md');
const TARGET_DIRECTORIES = [
  join(ROOT, 'src', 'app', 'components'),
  join(ROOT, 'src', 'app', 'layouts'),
  join(ROOT, 'src', 'app', 'pages', 'hds'),
];
const CATEGORY_ORDER = ['Primitives', 'Layouts', 'Pages', 'Utilities'];
const COMPONENT_UTILITY_NAMES = new Set([
  'CategoryComponentDocs',
  'ComponentDocPage',
  'DocPageFooterNote',
  'DocPageSpec',
  'DocSections',
  'ComponentPreview',
  'Controls',
  'ControlsPanel',
  'PreviewFrame',
  'SketchControls',
  'TokenDisplayToggle',
  'componentPreviewRegistry',
  'propTableUtils',
  'tokenTableUtils',
  'hooks',
  'types',
]);
const PAGE_UTILITY_NAMES = new Set([
  'HdsDocPrimitives',
  'HdsTocContext',
  'LegacyTokenExplorerPanel',
  'PortfolioAssetSlot',
  'TokenCascadeDiagram',
  'IconGallery',
]);

function toPosixPath(value) {
  return value.replace(/\\/g, '/');
}

function toRelativePath(value) {
  return toPosixPath(relative(ROOT, value));
}

function collectSourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, out);
      continue;
    }

    if (entry.endsWith('.d.ts')) continue;
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(resolve(fullPath));
    }
  }

  return out;
}

function createSourceFile(filePath, sourceText) {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    extname(filePath) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function stripShebang(sourceText) {
  return sourceText.startsWith('#!')
    ? sourceText.slice(sourceText.indexOf('\n') + 1)
    : sourceText;
}

function extractTopComment(sourceText) {
  const source = stripShebang(sourceText);
  let index = 0;
  const parts = [];

  while (index < source.length) {
    const whitespace = source.slice(index).match(/^[\s\r\n]+/);
    if (whitespace) index += whitespace[0].length;

    if (source.startsWith('/**', index) || source.startsWith('/*', index)) {
      const endIndex = source.indexOf('*/', index + 2);
      if (endIndex === -1) break;
      const rawBlock = source.slice(index, endIndex + 2);
      parts.push(formatBlockComment(rawBlock));
      index = endIndex + 2;
      continue;
    }

    if (source.startsWith('//', index)) {
      const lines = [];
      let cursor = index;

      while (cursor < source.length) {
        const lineEnd = source.indexOf('\n', cursor);
        const rawLine = lineEnd === -1 ? source.slice(cursor) : source.slice(cursor, lineEnd);
        if (!rawLine.trimStart().startsWith('//')) break;
        lines.push(rawLine.replace(/^\s*\/\/\s?/, '').trimEnd());
        if (lineEnd === -1) {
          cursor = source.length;
          break;
        }
        cursor = lineEnd + 1;
      }

      parts.push(lines.join('\n').trim());
      index = cursor;
      continue;
    }

    break;
  }

  return parts.filter(Boolean).join('\n\n').trim();
}

function formatBlockComment(block) {
  return block
    .replace(/^\/\*\*?/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

function hasModifier(node, modifier) {
  return Boolean(node.modifiers?.some((entry) => entry.kind === modifier));
}

function inferCallableKind(name, initializer) {
  if (!initializer) return null;

  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return name.startsWith('use')
      ? 'hook'
      : /^[A-Z]/.test(name)
        ? 'component'
        : 'function';
  }

  if (ts.isCallExpression(initializer)) {
    const callee = initializer.expression.getText();
    if (/(^|\.)(forwardRef|memo)$/.test(callee) || /^[A-Z]/.test(name)) {
      return 'component';
    }

    if (name.startsWith('use')) return 'hook';
  }

  return null;
}

function collectLocalCallableDeclarations(sourceFile) {
  const declarations = new Map();

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, {
        name: statement.name.text,
        kind: statement.name.text.startsWith('use') ? 'hook' : /^[A-Z]/.test(statement.name.text) ? 'component' : 'function',
      });
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, {
        name: statement.name.text,
        kind: /^[A-Z]/.test(statement.name.text) ? 'component' : 'class',
      });
      continue;
    }

    if (!ts.isVariableStatement(statement)) continue;

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name)) continue;
      const kind = inferCallableKind(declaration.name.text, declaration.initializer);
      if (!kind) continue;
      declarations.set(declaration.name.text, {
        name: declaration.name.text,
        kind,
      });
    }
  }

  return declarations;
}

function dedupeExports(exportsList) {
  const seen = new Set();
  return exportsList.filter((entry) => {
    const key = `${entry.name}:${entry.display}:${entry.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractExports(sourceFile) {
  const localCallables = collectLocalCallableDeclarations(sourceFile);
  const exportsList = [];

  const pushExport = (name, kind, options = {}) => {
    if (!name || !kind) return;
    const display = options.alias && options.alias !== name
      ? `${options.alias} (alias of ${name})`
      : options.defaultExport
        ? `${name} (default)`
        : name;

    exportsList.push({
      name,
      display,
      kind,
    });
  };

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
      && statement.name
      && hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    ) {
      const local = localCallables.get(statement.name.text);
      if (local) {
        pushExport(local.name, local.kind, {
          defaultExport: hasModifier(statement, ts.SyntaxKind.DefaultKeyword),
        });
      }
      continue;
    }

    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      const isDefaultExport = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);

      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const local = localCallables.get(declaration.name.text);
        if (!local) continue;
        pushExport(local.name, local.kind, { defaultExport: isDefaultExport });
      }
      continue;
    }

    if (ts.isExportAssignment(statement)) {
      if (ts.isIdentifier(statement.expression)) {
        const local = localCallables.get(statement.expression.text);
        if (local) pushExport(local.name, local.kind, { defaultExport: true });
      }
      continue;
    }

    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.exportClause) {
      continue;
    }

    if (!ts.isNamedExports(statement.exportClause)) continue;

    for (const specifier of statement.exportClause.elements) {
      const localName = specifier.propertyName?.text ?? specifier.name.text;
      const exportedName = specifier.name.text;
      const local = localCallables.get(localName);
      if (!local) continue;
      pushExport(local.name, local.kind, {
        alias: exportedName,
        defaultExport: exportedName === 'default',
      });
    }
  }

  return dedupeExports(exportsList);
}

function resolveLocalImport(fromFile, specifier, targetFiles) {
  if (!specifier.startsWith('.')) return null;

  const originDir = dirname(fromFile);
  const unresolved = resolve(originDir, specifier);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    join(unresolved, 'index.ts'),
    join(unresolved, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    const absoluteCandidate = resolve(candidate);
    if (targetFiles.has(absoluteCandidate)) {
      return absoluteCandidate;
    }
  }

  return null;
}

function extractLocalDependencies(sourceFile, filePath, targetFiles) {
  const dependencies = new Map();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const specifier = statement.moduleSpecifier.text;
    const resolvedPath = resolveLocalImport(filePath, specifier, targetFiles);
    if (!resolvedPath) continue;

    const names = [];
    const clause = statement.importClause;

    if (clause?.name) {
      names.push(clause.isTypeOnly ? `type ${clause.name.text}` : clause.name.text);
    }

    if (clause?.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        names.push(`* as ${clause.namedBindings.name.text}`);
      } else if (ts.isNamedImports(clause.namedBindings)) {
        clause.namedBindings.elements.forEach((element) => {
          const importedName = element.propertyName?.text ?? element.name.text;
          const localName = element.name.text;
          const prefix = element.isTypeOnly || clause.isTypeOnly ? 'type ' : '';
          names.push(
            importedName === localName
              ? `${prefix}${localName}`
              : `${prefix}${importedName} as ${localName}`,
          );
        });
      }
    }

    const key = toRelativePath(resolvedPath);
    const existing = dependencies.get(key);
    if (existing) {
      existing.names.push(...names);
      continue;
    }

    dependencies.set(key, {
      path: key,
      names: [...names],
    });
  }

  return [...dependencies.values()]
    .map((entry) => ({
      path: entry.path,
      names: [...new Set(entry.names)].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function determineCategory(filePath) {
  const relativePath = toRelativePath(filePath);
  const name = basename(relativePath, extname(relativePath));

  if (relativePath.startsWith('src/app/layouts/')) {
    return 'Layouts';
  }

  if (relativePath.startsWith('src/app/pages/hds/')) {
    if (/Layout$/.test(name) || /Shell$/.test(name)) return 'Layouts';
    if (PAGE_UTILITY_NAMES.has(name) || /(Context|Primitives|Panel|Diagram|Gallery|Slot)$/.test(name)) {
      return 'Utilities';
    }
    return 'Pages';
  }

  if (relativePath.startsWith('src/app/components/')) {
    if (extname(relativePath) === '.ts') return 'Utilities';
    if (COMPONENT_UTILITY_NAMES.has(name) || /(Utils|Registry|Spec)$/.test(name)) return 'Utilities';
    return 'Primitives';
  }

  return 'Utilities';
}

function getPrimaryLabel(record) {
  const preferredOrder = [
    (entry) => entry.display.endsWith('(default)') && (entry.kind === 'component' || entry.kind === 'class'),
    (entry) => entry.kind === 'component' || entry.kind === 'class',
    (entry) => entry.display.endsWith('(default)'),
    (entry) => entry.kind === 'hook',
    (entry) => entry.kind === 'function',
  ];

  for (const matcher of preferredOrder) {
    const match = record.exports.find(matcher);
    if (match) return match.name;
  }

  return basename(record.path, extname(record.path));
}

function quoteMarkdown(value) {
  if (!value.trim()) {
    return '> No top-of-file intent comment found.';
  }

  return value
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function formatExports(exportsList) {
  if (exportsList.length === 0) return 'None detected';
  return exportsList.map((entry) => `\`${entry.display}\``).join(', ');
}

function formatDependencyList(dependencies) {
  if (dependencies.length === 0) return '- None';

  return dependencies
    .map((dependency) => {
      const importedNames = dependency.names.length > 0
        ? ` via ${dependency.names.map((name) => `\`${name}\``).join(', ')}`
        : '';
      return `- \`${dependency.path}\`${importedNames}`;
    })
    .join('\n');
}

function buildDependencyChains(recordsByPath) {
  const adjacency = new Map();
  const categoryRank = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));

  for (const record of recordsByPath.values()) {
    adjacency.set(record.path, record.dependencies.map((dependency) => dependency.path));
  }

  function findBestChain(startPath, visiting = new Set()) {
    if (visiting.has(startPath)) return [startPath];
    visiting.add(startPath);

    const directDependencies = adjacency.get(startPath) ?? [];
    let bestChain = [startPath];

    for (const dependencyPath of directDependencies) {
      const candidate = [startPath, ...findBestChain(dependencyPath, new Set(visiting))];
      if (candidate.length > bestChain.length) {
        bestChain = candidate;
      }
    }

    return bestChain;
  }

  const directEdges = [...recordsByPath.values()]
    .filter((record) => record.dependencies.length > 0)
    .sort((left, right) => {
      const dependencyDelta = right.dependencies.length - left.dependencies.length;
      if (dependencyDelta !== 0) return dependencyDelta;

      const categoryDelta = (categoryRank.get(left.category) ?? 99) - (categoryRank.get(right.category) ?? 99);
      if (categoryDelta !== 0) return categoryDelta;

      return left.path.localeCompare(right.path);
    })
    .slice(0, 24);

  const uniqueChains = new Map();
  for (const record of recordsByPath.values()) {
    const chain = findBestChain(record.path);
    if (chain.length < 3) continue;
    uniqueChains.set(chain.join(' -> '), chain);
  }

  const transitiveChains = [...uniqueChains.values()]
    .sort((left, right) => {
      const lengthDelta = right.length - left.length;
      if (lengthDelta !== 0) return lengthDelta;

      const leftCategory = recordsByPath.get(left[0])?.category ?? '';
      const rightCategory = recordsByPath.get(right[0])?.category ?? '';
      const categoryDelta = (categoryRank.get(leftCategory) ?? 99) - (categoryRank.get(rightCategory) ?? 99);
      if (categoryDelta !== 0) return categoryDelta;

      return left[0].localeCompare(right[0]);
    })
    .slice(0, 24);

  return {
    directEdges,
    transitiveChains,
  };
}

function buildMarkdown(records) {
  const generatedAt = new Date().toISOString();
  const recordsByPath = new Map(records.map((record) => [record.path, record]));
  const dependencyChains = buildDependencyChains(recordsByPath);
  const categoryBuckets = new Map(CATEGORY_ORDER.map((category) => [category, []]));

  records.forEach((record) => {
    categoryBuckets.get(record.category)?.push(record);
  });

  const commentedCount = records.filter((record) => record.topComment).length;

  const summaryLines = [
    `- Files scanned: ${records.length}`,
    ...CATEGORY_ORDER.map((category) => `- ${category}: ${categoryBuckets.get(category)?.length ?? 0}`),
    `- Files with top-of-file intent comments: ${commentedCount}`,
    `- Files without top-of-file intent comments: ${records.length - commentedCount}`,
  ].join('\n');

  const categoryNote = [
    '- `Primitives` covers component-library files in `src/app/components/` that primarily render UI.',
    '- `Layouts` covers `src/app/layouts/` plus route-level shells/layout wrappers.',
    '- `Pages` covers HDS route/page modules.',
    '- `Utilities` covers helpers, registries, contexts, and page-support modules.',
  ].join('\n');

  const edgeSection = dependencyChains.directEdges.length === 0
    ? '- No internal HDS dependency edges detected.'
    : dependencyChains.directEdges
      .map((record) => {
        const dependencyLabels = record.dependencies
          .map((dependency) => {
            const target = recordsByPath.get(dependency.path);
            const label = target ? getPrimaryLabel(target) : basename(dependency.path, extname(dependency.path));
            return `\`${label}\``;
          })
          .join(', ');
        return `- \`${getPrimaryLabel(record)}\` -> ${dependencyLabels}`;
      })
      .join('\n');

  const chainSection = dependencyChains.transitiveChains.length === 0
    ? '- No transitive chains longer than two nodes were found.'
    : dependencyChains.transitiveChains
      .map((chain) => {
        const labels = chain.map((path) => {
          const record = recordsByPath.get(path);
          return `\`${record ? getPrimaryLabel(record) : basename(path, extname(path))}\``;
        });
        return `- ${labels.join(' -> ')}`;
      })
      .join('\n');

  const categorySections = CATEGORY_ORDER
    .map((category) => {
      const recordsInCategory = (categoryBuckets.get(category) ?? [])
        .sort((left, right) => left.path.localeCompare(right.path));

      const entries = recordsInCategory
        .map((record) => `### \`${getPrimaryLabel(record)}\`
Path: \`${record.path}\`

Exports: ${formatExports(record.exports)}

Local HDS dependencies:
${formatDependencyList(record.dependencies)}

Top comment:
${quoteMarkdown(record.topComment)}
`)
        .join('\n');

      return `## ${category}

${entries || '_No files in this category._'}
`;
    })
    .join('\n');

  return `# System Atlas

Generated: ${generatedAt}

Scope:
- \`src/app/components/\`
- \`src/app/layouts/\`
- \`src/app/pages/hds/\`

## Summary

${summaryLines}

## Classification Rules

${categoryNote}

## Dependency Chains

Direct file-level HDS edges:

${edgeSection}

Representative transitive chains:

${chainSection}

${categorySections}`;
}

export function generateSystemAtlas() {
  const absoluteFiles = TARGET_DIRECTORIES
    .flatMap((directory) => collectSourceFiles(directory))
    .sort((left, right) => toRelativePath(left).localeCompare(toRelativePath(right)));
  const targetFiles = new Set(absoluteFiles);

  const records = absoluteFiles.map((absolutePath) => {
    const sourceText = readFileSync(absolutePath, 'utf8');
    const sourceFile = createSourceFile(absolutePath, sourceText);

    return {
      category: determineCategory(absolutePath),
      path: toRelativePath(absolutePath),
      exports: extractExports(sourceFile),
      dependencies: extractLocalDependencies(sourceFile, absolutePath, targetFiles),
      topComment: extractTopComment(sourceText),
    };
  });

  const markdown = buildMarkdown(records);
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, `${markdown.trim()}\n`);
  return records;
}

export function main() {
  const records = generateSystemAtlas();
  console.log(`OK docs/SYSTEM_ATLAS.md (${records.length} files)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
