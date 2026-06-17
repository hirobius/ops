#!/usr/bin/env node
/**
 * Route coverage gate — every routable page must appear in the
 * layout-integrity test set. Adrian directive 2026-05-04: no exceptions.
 *
 * Lab sketchbook (/vibe-sketchbook/*) and pure Navigate redirects are the
 * only exempt surfaces. Parameterized routes (:slug, :id) are matched
 * against the test's pinned fixture URLs.
 *
 * Exits non-zero with a list of missing routes if drift is detected.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTES_FILE = join(ROOT, 'src/app/routes.tsx');
const TEST_FILE   = join(ROOT, 'tests/layout-integrity.spec.ts');

const EXEMPT_PREFIXES = ['/vibe-sketchbook'];

const EXEMPT_ROUTES = new Set([
  // LegacyWorkRedirectPage is a slug→destination router; every slug either
  // redirects or 404s. There is no rendered surface to layout-test.
  '/work/:slug',
]);

function extractTestRoutes() {
  const src = readFileSync(TEST_FILE, 'utf8');
  const block = src.match(/const ALL_ROUTES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!block) throw new Error('Could not locate ALL_ROUTES in tests/layout-integrity.spec.ts');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function getStringProp(obj, name) {
  const prop = obj.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name && p.name.getText() === name,
  );
  if (!prop) return undefined;
  if (ts.isStringLiteral(prop.initializer)) return prop.initializer.text;
  return undefined;
}

function getProp(obj, name) {
  return obj.properties.find(
    (p) => ts.isPropertyAssignment(p) && p.name && p.name.getText() === name,
  );
}

function isNavigateElement(node) {
  if (!node) return false;
  if (!ts.isPropertyAssignment(node)) return false;
  const init = node.initializer;
  if (!init) return false;
  const text = init.getText();
  return /<Navigate\b/.test(text);
}

function isWildcardPath(p) {
  return p === '*' || p.includes('*');
}

function joinPath(parent, child) {
  if (child.startsWith('/')) return child;
  if (parent === '/') return '/' + child;
  return (parent + '/' + child).replace(/\/+/g, '/');
}

function walkRoutes(node, parentPath, absolutes) {
  if (!ts.isObjectLiteralExpression(node)) return;

  const childPath = getStringProp(node, 'path');
  const childrenProp = getProp(node, 'children');
  const elementProp  = getProp(node, 'element');
  const componentProp = getProp(node, 'Component');
  const indexProp     = getProp(node, 'index');
  const isIndex = indexProp && indexProp.initializer.kind === ts.SyntaxKind.TrueKeyword;

  // Resolve this node's absolute path.
  const here = childPath !== undefined ? joinPath(parentPath, childPath) : parentPath;

  // Record this node IF it has a renderable element/component (not a Navigate)
  // OR is an index route — but skip if it's only a children container.
  const hasNavigate = isNavigateElement(elementProp);
  const hasComponent = !!componentProp;
  const hasElement   = !!elementProp;
  const isWildcard   = childPath !== undefined && isWildcardPath(childPath);

  if (!isWildcard && !hasNavigate && (hasComponent || hasElement || isIndex)) {
    absolutes.add(here);
  }

  // Recurse into children.
  if (childrenProp && ts.isArrayLiteralExpression(childrenProp.initializer)) {
    for (const el of childrenProp.initializer.elements) {
      walkRoutes(el, here, absolutes);
    }
  }
}

function extractRouterPaths() {
  const src = readFileSync(ROUTES_FILE, 'utf8');
  const sf = ts.createSourceFile(ROUTES_FILE, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const absolutes = new Set();

  // Find: createBrowserRouter([ ... ]).
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText() === 'createBrowserRouter' &&
      node.arguments[0] &&
      ts.isArrayLiteralExpression(node.arguments[0])
    ) {
      for (const el of node.arguments[0].elements) {
        walkRoutes(el, '', absolutes);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  return absolutes;
}

function isExempt(route) {
  if (EXEMPT_ROUTES.has(route)) return true;
  return EXEMPT_PREFIXES.some((p) => route === p || route.startsWith(p + '/'));
}

function paramsMatch(routerPath, testPath) {
  const rp = routerPath.split('/');
  const tp = testPath.split('/');
  if (rp.length !== tp.length) return false;
  return rp.every((seg, i) => seg.startsWith(':') || seg === tp[i]);
}

function main() {
  const router = [...extractRouterPaths()].sort();
  const tests = extractTestRoutes();
  const testSet = new Set(tests);
  const missing = [];

  for (const route of router) {
    if (isExempt(route)) continue;
    const normalized = route === '' ? '/' : route;
    if (testSet.has(normalized)) continue;
    if (normalized.includes(':')) {
      const matched = tests.some((t) => paramsMatch(normalized, t));
      if (matched) continue;
    }
    missing.push(normalized);
  }

  if (missing.length === 0) {
    console.log(`OK route coverage — ${router.length} router paths, all covered (or exempt).`);
    process.exit(0);
  }

  console.error('ROUTE COVERAGE GATE — missing from tests/layout-integrity.spec.ts ALL_ROUTES:');
  for (const r of missing) console.error(`  ↳ ${r}`);
  console.error('');
  console.error('Add each missing route to ALL_ROUTES, or document the exemption.');
  console.error('Standing directive (Adrian, 2026-05-04): no exceptions, no orphan pages.');
  process.exit(1);
}

main();
