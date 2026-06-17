#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-public-api.mjs
 *
 * Lightweight public-API surface guard for @hirobius/design-system.
 *
 * Why this exists (12n-api-extractor-wired)
 * ──────────────────────────────────────────
 * The package ships React primitives, patterns, and templates plus four
 * subpath modules (`tokens.css`, `tokens`, `cn`, `manifest`). Today nothing
 * catches a removed export or renamed symbol on the way to a PR — and
 * Concrete Creations (the first external consumer) is days away.
 *
 * The full @microsoft/api-extractor toolchain is ideal but assumes a
 * `dist/types/index.d.ts` rollup, which this project does not currently
 * produce (the package surfaces TypeScript source via `package.json#types`).
 * Adding a `.d.ts` emit step is a separate unit. In the meantime this
 * script gives CI exactly the breaking-change signal api-extractor would:
 *
 *   1. Walk every `export * from './foo'` re-export in `src/index.ts`
 *      (the `vite.config.lib.ts` main barrel) plus the additional named /
 *      default re-exports declared inline.
 *   2. Use the TypeScript compiler API to extract the *named* top-level
 *      symbols from each source file (functions, classes, const/let/var
 *      identifiers, interfaces, types, enums, type aliases, default exports,
 *      and named re-exports). The set is sorted and stable per-module.
 *   3. Emit a structured baseline at `docs/api/api-baseline.json`.
 *   4. Diff the live surface against the baseline:
 *        - **Removed symbol** → exit 1 (breaking change).
 *        - **Removed module** → exit 1 (breaking change).
 *        - **New symbol / new module** → printed as additions; exits 0
 *          *only* with `--allow-additions` (default) so trivial new exports
 *          do not block PRs. Use `--strict` to treat additions as failures.
 *      Run with `--update-baseline` to accept the current surface and
 *      rewrite the baseline.
 *
 * The same script powers `pnpm api:check` (CI) and `pnpm api:update`
 * (developer workflow when an intentional API change ships).
 *
 * When `dist/types/` exists in the future this script can be retired in
 * favour of api-extractor without touching consumers.
 *
 * Wiring verdict (12g-5): WIRE — breaking-change guard for external consumer
 * (Concrete Creations). Added to check:full as `api:check` and `api:update`.
 * Not pre-commit (uses TS compiler API, adds ~2s; appropriate for check:full).
 * Run `pnpm api:update` after any intentional API change, then commit the
 * updated docs/api/api-baseline.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // scripts/lib → scripts → project root
const SRC_DIR = join(ROOT, 'src');
const ENTRY = join(SRC_DIR, 'index.ts');
const BASELINE_DIR = join(ROOT, 'docs', 'api');
const BASELINE_PATH = join(BASELINE_DIR, 'api-baseline.json');

const args = new Set(process.argv.slice(2));
const UPDATE_BASELINE = args.has('--update-baseline');
const STRICT = args.has('--strict');
const JSON_OUTPUT = args.has('--json');

// ── helpers ─────────────────────────────────────────────────────────────────

function readSource(absolutePath) {
  return readFileSync(absolutePath, 'utf8');
}

function parse(absolutePath) {
  const text = readSource(absolutePath);
  return ts.createSourceFile(
    absolutePath,
    text,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );
}

function isExported(node) {
  const flags = ts.getCombinedModifierFlags(node);
  return Boolean(flags & ts.ModifierFlags.Export);
}

function isDefaultExported(node) {
  const flags = ts.getCombinedModifierFlags(node);
  return Boolean(flags & ts.ModifierFlags.Default);
}

function resolveRelativeImport(fromFile, specifier) {
  const fromDir = dirname(fromFile);
  // Direct path with extension already.
  const direct = resolve(fromDir, specifier);
  if (existsSync(direct) && /\.(tsx?|json)$/.test(specifier)) {
    return direct;
  }
  const candidates = [
    `${specifier}.tsx`,
    `${specifier}.ts`,
    `${specifier}.json`,
    join(specifier, 'index.tsx'),
    join(specifier, 'index.ts'),
  ];
  for (const candidate of candidates) {
    const absolute = resolve(fromDir, candidate);
    if (existsSync(absolute)) return absolute;
  }
  return null;
}

// ── extractors ──────────────────────────────────────────────────────────────

/**
 * Collect the named, top-level export symbols of a single source file.
 * Returns an alphabetically-sorted, deduped string list.
 */
function collectModuleSymbols(absolutePath) {
  const sourceFile = parse(absolutePath);
  const symbols = new Set();

  for (const statement of sourceFile.statements) {
    // export function foo() {}
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      if (isDefaultExported(statement)) {
        symbols.add('default');
      } else {
        symbols.add(statement.name.text);
      }
      continue;
    }

    // export class Foo {}
    if (ts.isClassDeclaration(statement) && statement.name && isExported(statement)) {
      if (isDefaultExported(statement)) {
        symbols.add('default');
      } else {
        symbols.add(statement.name.text);
      }
      continue;
    }

    // export const foo = …; export let foo = …; export var foo = …;
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          symbols.add(declaration.name.text);
        }
      }
      continue;
    }

    // export interface Foo {}
    if (ts.isInterfaceDeclaration(statement) && isExported(statement)) {
      symbols.add(statement.name.text);
      continue;
    }

    // export type Foo = …;
    if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
      symbols.add(statement.name.text);
      continue;
    }

    // export enum Foo {}
    if (ts.isEnumDeclaration(statement) && isExported(statement)) {
      symbols.add(statement.name.text);
      continue;
    }

    // export default <expression>; (e.g. `export default ApiReference;`)
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      symbols.add('default');
      continue;
    }

    // export { Foo, Bar as Baz };
    // export { Foo } from './x';   (re-export)
    if (ts.isExportDeclaration(statement) && statement.exportClause) {
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          symbols.add(element.name.text);
        }
      }
      continue;
    }
  }

  return Array.from(symbols).sort();
}

/**
 * Walk `src/index.ts` and resolve every `export * from './x'` to its source
 * module. Returns an ordered list of `{ specifier, modulePath }` pairs plus
 * any symbols re-exported inline by the barrel itself.
 */
function collectBarrelMap() {
  const sourceFile = parse(ENTRY);
  const reexports = [];
  const inlineBarrelSymbols = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;

    const moduleSpecifier = statement.moduleSpecifier;
    const isWildcard = !statement.exportClause;

    if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      const specifier = moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue; // skip package re-exports
      const modulePath = resolveRelativeImport(ENTRY, specifier);
      if (!modulePath) {
        throw new Error(
          `[check-public-api] Could not resolve barrel re-export "${specifier}" from ${relative(ROOT, ENTRY)}`,
        );
      }

      if (isWildcard) {
        reexports.push({ specifier, modulePath, kind: 'wildcard' });
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        // export { default as hds } from './x'  → record the renamed symbol
        // attached to the barrel itself, not the underlying module.
        for (const element of statement.exportClause.elements) {
          inlineBarrelSymbols.add(element.name.text);
        }
      }
    }
  }

  // Catch barrel-internal `export { cn } from './lib/utils';` style which uses
  // a moduleSpecifier — already handled above. Also catch barrel-side re-exports
  // declared as `export { default as hds } from './x';` (covered above).
  // Finally, surface any *barrel-local* declarations (rare but possible):
  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          inlineBarrelSymbols.add(declaration.name.text);
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      inlineBarrelSymbols.add(statement.name.text);
    }
  }

  return {
    reexports,
    inlineBarrelSymbols: Array.from(inlineBarrelSymbols).sort(),
  };
}

/**
 * Build the live API surface — a map from human-readable module key
 * (e.g. `./app/components/button`) to its sorted symbol list, plus the
 * subpath modules declared in package.json#exports that are surfaced
 * separately by `vite.config.lib.ts`.
 */
function collectPublicApi() {
  const surface = {
    entry: 'src/index.ts',
    generatedAt: 'baseline',
    modules: {},
  };

  const { reexports, inlineBarrelSymbols } = collectBarrelMap();

  if (inlineBarrelSymbols.length > 0) {
    surface.modules['(barrel)'] = inlineBarrelSymbols;
  }

  for (const { specifier, modulePath } of reexports) {
    const symbols = collectModuleSymbols(modulePath);
    surface.modules[specifier] = symbols;
  }

  // Subpath modules wired via vite.config.lib.ts → package.json#exports.
  // Drift in these has the same blast radius as the main barrel.
  const subpathEntries = [
    { key: '@subpath/cn', file: join(SRC_DIR, 'lib', 'utils.ts') },
    { key: '@subpath/tokens', file: join(SRC_DIR, 'app', 'design-system', 'tokens.ts') },
    { key: '@subpath/manifest', file: join(SRC_DIR, 'lib', 'manifest-entry.ts') },
  ];

  for (const { key, file } of subpathEntries) {
    if (!existsSync(file)) continue;
    surface.modules[key] = collectModuleSymbols(file);
  }

  return surface;
}

// ── diff ────────────────────────────────────────────────────────────────────

function diffSurfaces(baseline, current) {
  const breakingChanges = [];
  const additions = [];

  const baselineModules = new Set(Object.keys(baseline.modules ?? {}));
  const currentModules = new Set(Object.keys(current.modules ?? {}));

  for (const moduleKey of baselineModules) {
    if (!currentModules.has(moduleKey)) {
      breakingChanges.push({
        kind: 'module-removed',
        module: moduleKey,
        symbol: null,
      });
      continue;
    }
    const baselineSymbols = new Set(baseline.modules[moduleKey] ?? []);
    const currentSymbols = new Set(current.modules[moduleKey] ?? []);
    for (const symbol of baselineSymbols) {
      if (!currentSymbols.has(symbol)) {
        breakingChanges.push({
          kind: 'symbol-removed',
          module: moduleKey,
          symbol,
        });
      }
    }
    for (const symbol of currentSymbols) {
      if (!baselineSymbols.has(symbol)) {
        additions.push({
          kind: 'symbol-added',
          module: moduleKey,
          symbol,
        });
      }
    }
  }

  for (const moduleKey of currentModules) {
    if (!baselineModules.has(moduleKey)) {
      additions.push({
        kind: 'module-added',
        module: moduleKey,
        symbol: null,
      });
    }
  }

  return { breakingChanges, additions };
}

// ── main ────────────────────────────────────────────────────────────────────

function ensureBaselineDir() {
  if (!existsSync(BASELINE_DIR)) {
    mkdirSync(BASELINE_DIR, { recursive: true });
  }
}

function readBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function writeBaseline(surface) {
  ensureBaselineDir();
  writeFileSync(BASELINE_PATH, `${JSON.stringify(surface, null, 2)}\n`, 'utf8');
}

function totalSymbolCount(surface) {
  let total = 0;
  for (const symbols of Object.values(surface.modules ?? {})) {
    total += symbols.length;
  }
  return total;
}

function main() {
  const current = collectPublicApi();

  if (UPDATE_BASELINE) {
    writeBaseline(current);
    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ updated: true, baseline: BASELINE_PATH, surface: current }, null, 2));
    } else {
      const moduleCount = Object.keys(current.modules).length;
      const symbolCount = totalSymbolCount(current);
      console.log(
        `[check-public-api] baseline updated → ${relative(ROOT, BASELINE_PATH)}`,
      );
      console.log(`[check-public-api] ${moduleCount} modules, ${symbolCount} exported symbols`);
    }
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.error(
      `[check-public-api] No baseline at ${relative(ROOT, BASELINE_PATH)}.\n` +
        `[check-public-api] Run \`pnpm api:update\` once to accept the current surface, ` +
        `then commit ${relative(ROOT, BASELINE_PATH)}.`,
    );
    process.exit(1);
  }

  const { breakingChanges, additions } = diffSurfaces(baseline, current);

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ breakingChanges, additions }, null, 2));
  } else {
    if (breakingChanges.length > 0) {
      console.error(
        `[check-public-api] ❌ ${breakingChanges.length} breaking change${breakingChanges.length === 1 ? '' : 's'} detected:`,
      );
      for (const change of breakingChanges) {
        if (change.kind === 'module-removed') {
          console.error(`  - module removed: ${change.module}`);
        } else {
          console.error(`  - symbol removed: ${change.symbol} (from ${change.module})`);
        }
      }
    }
    if (additions.length > 0) {
      const label = breakingChanges.length > 0 ? 'Additions (also present)' : 'Additions detected';
      console.log(`[check-public-api] ${label}: ${additions.length}`);
      for (const change of additions) {
        if (change.kind === 'module-added') {
          console.log(`  + module added: ${change.module}`);
        } else {
          console.log(`  + symbol added: ${change.symbol} (in ${change.module})`);
        }
      }
    }
    if (breakingChanges.length === 0 && additions.length === 0) {
      console.log(
        `[check-public-api] ✅ public API surface matches baseline (${totalSymbolCount(current)} symbols across ${Object.keys(current.modules).length} modules).`,
      );
    }
  }

  if (breakingChanges.length > 0) {
    console.error(
      `[check-public-api] To accept these changes (e.g. an intentional major-version bump), run:\n` +
        `[check-public-api]   pnpm api:update`,
    );
    process.exit(1);
  }

  if (STRICT && additions.length > 0) {
    console.error(
      `[check-public-api] --strict: additions are not allowed without --update-baseline.`,
    );
    process.exit(1);
  }

  process.exit(0);
}

try {
  main();
} catch (error) {
  console.error('[check-public-api] fatal:', error?.stack || error?.message || error);
  process.exit(2);
}
