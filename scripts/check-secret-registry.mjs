#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Drift gate between the fleet's actual `secrets.NAME` workflow references
 * and `docs/secrets/registry.json` (ops#415). Every `secrets.NAME` found in
 * any fleet repo's `.github/workflows/*.yml` must have a registry entry for
 * that (repo, name) pair; every registry entry must be referenced somewhere.
 * Exits 1 naming the offender in either direction — this is what makes "every
 * new secret gets registered" deterministic instead of a convention someone
 * has to remember.
 *
 * A naive `grep -rhoE "secrets\.[A-Z_][A-Z0-9_]*"` also matches PROSE that
 * happens to look like a reference — e.g. a code comment illustrating
 * `if: ${{ secrets.X == '' }}` as an anti-pattern is not a real secret named
 * `X`. This gate does the same textual match (deliberately: the registry
 * should reflect what a human/agent doing that grep would see), but any name
 * that should NOT require a registry entry is handled by an EXPLICIT,
 * reasoned allowlist (ALLOWLIST below) — never a heuristic filter, which
 * would silently swallow a real secret that happened to match it.
 *
 * Fleet repos are read from disk as siblings of this repo's parent directory
 * (../<repo>, overridable via FLEET_ROOT for tests) — the six named in
 * docs/ai/HANDOFF.md: ops, hds, site-engine, Ralph, folio, concrete. A repo
 * directory absent from disk is reported, never silently skipped — scanning
 * fewer repos must not look like a clean pass.
 *
 * Usage:
 *   node scripts/check-secret-registry.mjs
 *   node scripts/check-secret-registry.mjs --json
 *
 * Env:
 *   FLEET_ROOT   directory containing the sibling repo checkouts. Defaults to
 *                the parent of this repo's working directory (../). Tests
 *                override it to point at fixture trees.
 *
 * Exit codes: 0 clean · 1 drift found (unregistered reference, or a registry
 * entry nothing references) · 2 invocation error (registry.json missing/bad).
 *
 * @module check-secret-registry
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = join(ROOT, 'docs/secrets/registry.json');

/** The fleet, per docs/ai/HANDOFF.md's "The fleet is SIX repos" section. */
export const FLEET_REPO_DIRS = ['ops', 'hds', 'site-engine', 'Ralph', 'folio', 'concrete'];

/** Local directory name → the `repo` value used in registry.json entries. */
export const REPO_NAME_MAP = {
  ops: 'hirobius/ops',
  hds: 'hirobius/hds',
  'site-engine': 'hirobius/site-engine',
  Ralph: 'hirobius/Ralph',
  folio: 'hirobius/folio',
  concrete: 'hirobius/concrete',
};

/**
 * Names that legitimately match `secrets\.[A-Z_][A-Z0-9_]*` but must NOT
 * require a docs/secrets/registry.json entry. Each needs a reason — this is
 * read by a human before it's trusted, so an unreasoned entry is as bad as
 * having none.
 */
export const ALLOWLIST = [
  {
    name: 'GITHUB_TOKEN',
    reason:
      "GitHub Actions' automatic per-run token (or an explicit fallback to it, e.g. " +
      "ops's ralph-watchdog.yml: `secrets.RALPH_WATCHDOG_TOKEN || secrets.GITHUB_TOKEN`). " +
      'It is minted fresh per workflow run and expires when the run ends — never stored, ' +
      'nothing to rotate, nothing that can lapse silently. Registering it would make the ' +
      "drift gate flag every fleet repo's default GITHUB_TOKEN usage as a missing secret.",
  },
  {
    name: 'X',
    reason:
      'Literal placeholder text `secrets.X` used in a code comment illustrating an ' +
      "anti-pattern (`if: ${{ secrets.X == '' }}` — \"why this guard reads the secret " +
      'through `env`, not a step-level `if`"), introduced alongside hds\'s RELEASE_PAT ' +
      "guard. Confirmed ABSENT from every fleet repo's current default branch as of " +
      "2026-09-22 (it lives only on hds's unmerged `claude/release-pat` branch) — kept " +
      'here defensively so it never gets read as a real secret named `X` if that branch, ' +
      'or another comment like it, lands later.',
  },
];

const SECRET_REF_RE = /secrets\.([A-Z_][A-Z0-9_]*)/g;

/**
 * Strip `# ...` line comments from a YAML file's text before scanning it —
 * mirrors scripts/lib/yaml-comments.mjs's reasoning (check-validator-wiring
 * ops#262/#304): a *prose mention* of a name in a comment reads differently
 * from a live `${{ secrets.NAME }}` reference, and this gate wants both
 * (the workflow's live references, for drift; and yes, comment prose too,
 * since that's exactly the false-positive case ALLOWLIST exists to name) —
 * so unlike check-validator-wiring this gate does NOT strip comments. See
 * the ALLOWLIST entry for `X` above: it is deliberately matched, not hidden.
 */
function findSecretRefs(content) {
  const names = new Set();
  for (const m of content.matchAll(SECRET_REF_RE)) names.add(m[1]);
  return names;
}

/**
 * Scan one repo's `.github/workflows/*.yml` (and `.yaml`) for `secrets.NAME`
 * references.
 *
 * @param {string} repoDir absolute path to the repo checkout
 * @returns {{ present: boolean, workflowsDir: boolean, refs: Map<string, string[]> }}
 *   refs maps secret name → the workflow filenames it was found in.
 */
export function scanRepoWorkflows(repoDir) {
  if (!existsSync(repoDir)) return { present: false, workflowsDir: false, refs: new Map() };
  const wfDir = join(repoDir, '.github/workflows');
  if (!existsSync(wfDir)) return { present: true, workflowsDir: false, refs: new Map() };

  const refs = new Map();
  const files = readdirSync(wfDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    const content = readFileSync(join(wfDir, file), 'utf8');
    for (const name of findSecretRefs(content)) {
      if (!refs.has(name)) refs.set(name, []);
      refs.get(name).push(file);
    }
  }
  return { present: true, workflowsDir: true, refs };
}

/**
 * Compare a fleet scan against the registry. Pure — takes data, returns
 * violations, so it's testable without touching disk or the real registry.
 *
 * @param {Object} input
 * @param {Record<string, {present: boolean, workflowsDir: boolean, refs: Map<string,string[]>}>} input.scanByRepo
 *   keyed by the registry `repo` value (e.g. "hirobius/ops")
 * @param {{name: string, repo: string}[]} input.registryEntries
 * @param {{name: string, reason: string}[]} [input.allowlist]
 * @returns {{ violations: object[], summary: object }}
 */
export function reconcileSecrets({ scanByRepo, registryEntries, allowlist = ALLOWLIST }) {
  const violations = [];
  const allowlistNames = new Set(allowlist.map((a) => a.name));
  const registered = new Set(registryEntries.map((e) => `${e.repo}::${e.name}`));
  const usedRegistryKeys = new Set();

  for (const [repo, scan] of Object.entries(scanByRepo)) {
    if (!scan.present) {
      violations.push({
        file: '*',
        line: null,
        rule: 'repo-absent',
        severity: 'warn',
        message: `${repo} is not present on disk — its workflows were NOT scanned. This is reported, not silently passed over.`,
        repo,
      });
      continue;
    }
    for (const [name, files] of scan.refs.entries()) {
      if (allowlistNames.has(name)) continue;
      const key = `${repo}::${name}`;
      if (registered.has(key)) {
        usedRegistryKeys.add(key);
        continue;
      }
      violations.push({
        file: files[0],
        line: null,
        rule: 'unregistered-secret',
        severity: 'error',
        message: `${repo}: secrets.${name} is referenced in ${files.join(', ')} but has no docs/secrets/registry.json entry for {"repo":"${repo}","name":"${name}"}.`,
        repo,
        name,
      });
    }
  }

  for (const entry of registryEntries) {
    const key = `${entry.repo}::${entry.name}`;
    if (usedRegistryKeys.has(key)) continue;
    // A registry entry for a repo that's absent on disk (or has no workflows
    // dir) can't be confirmed OR refuted by this scan — that's a repo-absent
    // warning above, not a claim the entry is unreferenced.
    const scan = scanByRepo[entry.repo];
    if (!scan || !scan.present || !scan.workflowsDir) continue;
    violations.push({
      file: '*',
      line: null,
      rule: 'unreferenced-registry-entry',
      severity: 'error',
      message: `docs/secrets/registry.json has an entry for {"repo":"${entry.repo}","name":"${entry.name}"} but no workflow in ${entry.repo} references secrets.${entry.name}.`,
      repo: entry.repo,
      name: entry.name,
    });
  }

  return {
    violations,
    summary: {
      reposScanned: Object.values(scanByRepo).filter((s) => s.present).length,
      reposAbsent: Object.values(scanByRepo).filter((s) => !s.present).length,
      registryEntries: registryEntries.length,
      matched: usedRegistryKeys.size,
    },
  };
}

function loadRegistry(registryPath = REGISTRY_PATH) {
  const raw = readFileSync(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.secrets)) throw new Error('registry.json: "secrets" is not an array');
  return parsed.secrets;
}

function main(argv = process.argv) {
  const jsonMode = hasJsonFlag(argv);
  const fleetRoot = resolve(process.env.FLEET_ROOT || join(ROOT, '..'));

  let registryEntries;
  try {
    registryEntries = loadRegistry();
  } catch (err) {
    console.error(
      `check-secret-registry: could not read docs/secrets/registry.json: ${err.message}`,
    );
    return 2;
  }

  const scanByRepo = {};
  for (const dir of FLEET_REPO_DIRS) {
    const repo = REPO_NAME_MAP[dir];
    scanByRepo[repo] = scanRepoWorkflows(join(fleetRoot, dir));
  }

  const { violations, summary } = reconcileSecrets({ scanByRepo, registryEntries });

  if (jsonMode) {
    emitResult({ violations, summary, ok: violations.length === 0 }, true);
    return violations.length > 0 ? 1 : 0;
  }

  const repoAbsent = violations.filter((v) => v.rule === 'repo-absent');
  const blocking = violations.filter((v) => v.rule !== 'repo-absent');

  for (const v of repoAbsent) console.warn(`⚠ ${v.message}`);

  if (blocking.length === 0) {
    console.log(
      `✓ check-secret-registry — ${summary.registryEntries} registry entr${summary.registryEntries === 1 ? 'y' : 'ies'}, ` +
        `${summary.reposScanned} repo(s) scanned, all matched.` +
        (repoAbsent.length > 0
          ? ` (${repoAbsent.length} repo(s) absent from disk — see warnings above.)`
          : ''),
    );
  } else {
    console.error(`✗ check-secret-registry — ${blocking.length} drift finding(s):`);
    for (const v of blocking) console.error(`  [${v.rule}] ${v.message}`);
  }

  return blocking.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}

export { main };
