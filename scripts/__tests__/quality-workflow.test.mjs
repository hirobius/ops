/**
 * ops#241 — `.github/workflows/quality.yml` invokes gates only through
 * `run-gates.mjs --channel ci-pr`, and every check it used to run as a bespoke
 * step is a registry gate that still blocks.
 *
 * Every other `run:` step must be declared non-gate setup (install / build /
 * browser install) or the advisory dependency audit. Adding a new direct gate
 * step fails here — register the check in docs/guardrails/registry.json on the
 * ci-pr channel instead.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stripYamlComments } from '../lib/yaml-comments.mjs';
import { COMMAND_GATES, FIXTURE_FLAG } from '../lib/command-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'quality.yml');

const registry = JSON.parse(readFileSync(join(ROOT, 'docs/guardrails/registry.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/**
 * Minimal step reader for a single-job workflow: returns each `- ` list item
 * under `steps:` as { name, run, uses, continueOnError }. Not a YAML parser —
 * quality.yml's steps are flat key/value maps, which is all this needs.
 */
function readSteps(yaml) {
  const lines = stripYamlComments(yaml).split('\n');
  const steps = [];
  let inSteps = false;
  let itemIndent = -1;
  let current = null;
  let blockKey = null;
  let blockIndent = -1;

  for (const line of lines) {
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;

    if (/^\s*steps:\s*$/.test(line)) {
      inSteps = true;
      continue;
    }
    if (!inSteps) continue;

    if (blockKey && indent > blockIndent) {
      current[blockKey] = `${current[blockKey]}\n${line.trim()}`.trim();
      continue;
    }
    blockKey = null;

    const item = line.match(/^(\s*)- ([\w-]+):\s*(.*)$/);
    if (item && (itemIndent === -1 || item[1].length === itemIndent)) {
      itemIndent = item[1].length;
      current = {};
      steps.push(current);
      assign(current, item[2], item[3], itemIndent + 2);
      continue;
    }
    const kv = line.match(/^(\s*)([\w-]+):\s*(.*)$/);
    if (current && kv && kv[1].length === itemIndent + 2) {
      assign(current, kv[2], kv[3], kv[1].length);
    }
  }
  return steps.map((s) => ({
    name: s.name ?? null,
    run: s.run ?? null,
    uses: s.uses ?? null,
    continueOnError: s['continue-on-error'] === 'true',
  }));

  function assign(step, key, value, keyIndent) {
    if (value === '|' || value === '>') {
      step[key] = '';
      blockKey = key;
      blockIndent = keyIndent;
    } else {
      step[key] = value.trim();
    }
  }
}

const steps = readSteps(readFileSync(WORKFLOW, 'utf8'));
const runSteps = steps.filter((s) => s.run !== null);

const RUNNER = /^node scripts\/run-gates\.mjs --channel ci-pr(\s|$)/;

// The only `run:` steps allowed outside the registry runner. None of these is a
// pass/fail quality check on the code: they install, build, or are advisory.
const NON_GATE_STEPS = [
  { pattern: /^pnpm install --frozen-lockfile$/, why: 'dependency install (setup)' },
  { pattern: /^pnpm build$/, why: 'production build — a prerequisite, kept explicit per #241' },
  {
    pattern: /^pnpm exec playwright install --with-deps chromium$/,
    why: 'browser binaries for the ci-pr layout-tests gate (setup)',
  },
  {
    pattern: /^pnpm audit\b/,
    why: 'advisory dependency audit (#243) — must stay continue-on-error',
    advisory: true,
  },
];

describe('quality.yml — gates run only through run-gates.mjs (ops#241)', () => {
  it('parses the workflow steps', () => {
    expect(steps.length).toBeGreaterThan(0);
    expect(runSteps.length).toBeGreaterThan(0);
  });

  it('has no run step besides declared setup steps and the registry runner', () => {
    const undeclared = runSteps
      .filter((s) => !RUNNER.test(s.run) && !NON_GATE_STEPS.some((d) => d.pattern.test(s.run)))
      .map((s) => `${s.name}: ${s.run}`);
    expect(
      undeclared,
      'register these as ci-pr gates in docs/guardrails/registry.json instead of a workflow step',
    ).toEqual([]);
  });

  it('keeps advisory steps advisory', () => {
    for (const s of runSteps) {
      const decl = NON_GATE_STEPS.find((d) => d.pattern.test(s.run));
      if (decl?.advisory)
        expect(s.continueOnError, `${s.name} must be continue-on-error`).toBe(true);
    }
  });

  it('invokes the ci-pr runner exactly once, and lets it block', () => {
    const runners = runSteps.filter((s) => RUNNER.test(s.run));
    expect(runners).toHaveLength(1);
    expect(runners[0].continueOnError).toBe(false);
    expect(runSteps.some((s) => s.run.includes('run-gates.mjs') && !RUNNER.test(s.run))).toBe(
      false,
    );
  });

  it('installs the Playwright browser before the runner needs it', () => {
    const browser = runSteps.findIndex((s) => /playwright install/.test(s.run));
    const runner = runSteps.findIndex((s) => RUNNER.test(s.run));
    expect(browser).toBeGreaterThanOrEqual(0);
    expect(browser).toBeLessThan(runner);
  });
});

describe('former quality.yml steps are blocking ci-pr registry gates (ops#241)', () => {
  // The bespoke steps #241 folded into the registry, by the pnpm script each ran.
  const FOLDED = {
    'check-typecheck': 'typecheck',
    'check-type-coverage': 'check:type-coverage',
    'check-layout-tests': 'test:layout',
  };

  it('covers exactly the folded steps', () => {
    expect(Object.keys(COMMAND_GATES).sort()).toEqual(Object.keys(FOLDED).sort());
  });

  for (const [id, script] of Object.entries(FOLDED)) {
    describe(id, () => {
      const entry = registry.gates.find((g) => g.id === id);

      it('is registered on ci-pr at error severity', () => {
        expect(entry, `${id} missing from registry.json`).toBeDefined();
        expect(entry.firingChannel).toBe('ci-pr');
        expect(entry.severity).toBe('error');
        expect(entry.gateScript).toBe(`scripts/${id}.mjs`);
        expect(existsSync(join(ROOT, entry.gateScript))).toBe(true);
        expect(entry.fixturePath).toBe(`fixtures/${id}`);
      });

      it(`runs the same pnpm script the workflow step ran (${script})`, () => {
        expect(COMMAND_GATES[id]).toBe(`pnpm run ${script}`);
        expect(pkg.scripts[script], `package.json has no "${script}" script`).toBeTruthy();
      });

      it('is exempt from meta-probes, with a reason', () => {
        expect(typeof entry.skipMetaProbe).toBe('string');
        expect(entry.skipMetaProbe.trim().length).toBeGreaterThan(0);
      });

      for (const [fixture, expected] of [
        ['violating', 1],
        ['passing', 0],
      ]) {
        it(`exits ${expected} on its ${fixture} fixture`, () => {
          const r = spawnSync(process.execPath, [join(ROOT, entry.gateScript), FIXTURE_FLAG], {
            cwd: ROOT,
            encoding: 'utf8',
            env: {
              ...process.env,
              FIXTURE_FILE: join(ROOT, entry.fixturePath, `${fixture}.example.mjs`),
            },
          });
          expect(r.status, `${r.stdout}${r.stderr}`).toBe(expected);
        });
      }
    });
  }
});
