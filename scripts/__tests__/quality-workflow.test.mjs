/**
 * ops#241 — `.github/workflows/quality.yml` invokes gates only through
 * `run-gates.mjs --channel ci-pr`, and every check it used to run as a bespoke
 * step is a registry gate that still blocks.
 *
 * Every other `run:` step must be declared non-gate setup (install / build /
 * browser install) or the advisory dependency audit. Adding a new direct gate
 * step fails here — register the check in docs/guardrails/registry.json on the
 * ci-pr channel instead.
 *
 * The audit matches whole commands, not prefixes, and rejects every key that
 * can stop the runner from blocking (`|| true`, a chained command, `if:`,
 * `continue-on-error:` on the step or the job). The mutation cases below prove
 * each of those edits turns the audit red (PR #382 review).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stripYamlComments } from '../lib/yaml-comments.mjs';
import { COMMAND_GATES, FIXTURE_FLAG } from '../lib/command-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WORKFLOW = join(ROOT, '.github', 'workflows', 'quality.yml');

const registry = JSON.parse(readFileSync(join(ROOT, 'docs/guardrails/registry.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

const KEY_LINE = /^(\s*)([\w-]+):\s*(.*)$/;
const BLOCK_SCALAR = /^[|>][-+]?\d*$/;

function yamlLines(yaml) {
  return stripYamlComments(yaml).split(/\r?\n/);
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

/**
 * Minimal step reader for a single-job workflow: returns each `- ` list item
 * under `steps:` as { name, run, uses, if, continueOnError, keys }. Not a YAML
 * parser — quality.yml's steps are flat key/value maps, which is all this needs.
 * Block scalars (`run: |`) are joined with newlines so a chained second command
 * stays visible to the whole-line matchers.
 */
function readSteps(yaml) {
  const steps = [];
  let inSteps = false;
  let itemIndent = -1;
  let current = null;
  let blockKey = null;
  let blockIndent = -1;

  for (const line of yamlLines(yaml)) {
    if (line.trim() === '') continue;
    const indent = indentOf(line);

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
    const kv = line.match(KEY_LINE);
    if (current && kv && kv[1].length === itemIndent + 2) {
      assign(current, kv[2], kv[3], kv[1].length);
    }
  }
  return steps.map((s) => ({
    name: s.name ?? null,
    run: s.run ?? null,
    uses: s.uses ?? null,
    if: s.if ?? null,
    continueOnError: s['continue-on-error'] === 'true',
    keys: Object.keys(s),
  }));

  function assign(step, key, value, keyIndent) {
    if (BLOCK_SCALAR.test(value.trim())) {
      step[key] = '';
      blockKey = key;
      blockIndent = keyIndent;
    } else {
      step[key] = value.trim();
    }
  }
}

/** Every job under `jobs:` as { id, keys } — keys are the job's own top-level keys. */
function readJobs(yaml) {
  const jobs = [];
  let inJobs = false;
  let jobIndent = -1;
  let current = null;

  for (const line of yamlLines(yaml)) {
    if (line.trim() === '') continue;
    const indent = indentOf(line);

    if (indent === 0) {
      inJobs = /^jobs:\s*$/.test(line);
      current = null;
      continue;
    }
    if (!inJobs) continue;

    const kv = line.match(KEY_LINE);
    if (!kv) continue;
    if (jobIndent === -1) jobIndent = indent;
    if (indent === jobIndent) {
      current = { id: kv[2], keys: {} };
      jobs.push(current);
    } else if (current && indent === jobIndent + 2) {
      current.keys[kv[2]] = kv[3].trim();
    }
  }
  return jobs;
}

// Whole-command matchers: anything appended (`|| true`, `; cmd`, a second line
// in a `run: |` block, a narrowing flag) no longer matches.
const RUNNER = /^node scripts\/run-gates\.mjs --channel ci-pr --parallel \d+$/;

// The runner step may carry only these keys. `if:` can skip it, and
// `continue-on-error:` (in any spelling, e.g. `${{ true }}`) lets it fail green.
const RUNNER_KEYS = ['name', 'run'];

// Job-level keys that make a failing ci-pr run report green: a skipped job
// satisfies a required check, and continue-on-error hides the failure.
const JOB_BYPASS_KEYS = ['if', 'continue-on-error'];

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
    pattern: /^pnpm audit --audit-level \w+$/,
    why: 'advisory dependency audit (#243) — must stay continue-on-error',
    advisory: true,
  },
];

/** The ops#241 contract for quality.yml. Returns problems; [] means compliant. */
function auditQualityWorkflow(yaml) {
  const problems = [];
  const steps = readSteps(yaml);
  const runSteps = steps.filter((s) => s.run !== null);
  const jobs = readJobs(yaml);

  if (jobs.length !== 1) problems.push(`expected exactly one job, found ${jobs.length}`);
  for (const job of jobs) {
    for (const key of JOB_BYPASS_KEYS) {
      if (key in job.keys) {
        problems.push(`job "${job.id}" sets \`${key}\` — the ci-pr run could report green`);
      }
    }
  }

  if (runSteps.length === 0) problems.push('no run: steps parsed');

  for (const s of runSteps) {
    if (RUNNER.test(s.run) || NON_GATE_STEPS.some((d) => d.pattern.test(s.run))) continue;
    problems.push(
      `undeclared run step "${s.name}": ${JSON.stringify(s.run)} — register it as a ci-pr gate in docs/guardrails/registry.json instead`,
    );
  }

  for (const s of runSteps) {
    const decl = NON_GATE_STEPS.find((d) => d.pattern.test(s.run));
    if (decl?.advisory && !s.continueOnError) {
      problems.push(`advisory step "${s.name}" must be continue-on-error`);
    }
  }

  const runners = runSteps.filter((s) => RUNNER.test(s.run));
  if (runners.length !== 1) {
    problems.push(`expected the ci-pr runner exactly once, found ${runners.length}`);
  }
  for (const r of runners) {
    const extra = r.keys.filter((k) => !RUNNER_KEYS.includes(k));
    if (extra.length > 0) {
      problems.push(
        `runner step "${r.name}" sets ${extra.map((k) => `\`${k}\``).join(', ')} — it may carry only ${RUNNER_KEYS.join(', ')}, so it always blocks`,
      );
    }
  }

  const browser = runSteps.findIndex((s) => /playwright install/.test(s.run));
  const runner = runSteps.findIndex((s) => RUNNER.test(s.run));
  if (browser === -1 || runner === -1 || browser > runner) {
    problems.push('the Playwright browser install must come before the ci-pr runner');
  }

  return problems;
}

const WORKFLOW_YAML = readFileSync(WORKFLOW, 'utf8');
const RUNNER_LINE = '        run: node scripts/run-gates.mjs --channel ci-pr --parallel 4';
const AUDIT_LINE = '        run: pnpm audit --audit-level high';
const RUNS_ON_LINE = '    runs-on: ubuntu-latest';

describe('quality.yml — gates run only through run-gates.mjs (ops#241)', () => {
  it('parses the workflow steps and its single job', () => {
    const steps = readSteps(WORKFLOW_YAML);
    expect(steps.filter((s) => s.run !== null).length).toBeGreaterThan(0);
    expect(readJobs(WORKFLOW_YAML).map((j) => j.id)).toEqual(['gates']);
  });

  it('the committed quality.yml satisfies the contract', () => {
    expect(auditQualityWorkflow(WORKFLOW_YAML)).toEqual([]);
  });

  describe('rejects edits that stop a gate from blocking (PR #382 review)', () => {
    // Each mutation is a single edit to the committed file. The anchor lines are
    // asserted present, so a reworded workflow fails loudly here instead of
    // silently testing an unmutated copy.
    const MUTATIONS = [
      {
        name: 'runner swallowed with `|| true`',
        from: RUNNER_LINE,
        to: `${RUNNER_LINE} || true`,
        expect: /undeclared run step/,
      },
      {
        name: 'runner narrowed to a single gate',
        from: RUNNER_LINE,
        to: `${RUNNER_LINE} --gate check-typecheck`,
        expect: /undeclared run step/,
      },
      {
        name: 'a direct command chained after the runner in a `run: |` block',
        from: RUNNER_LINE,
        to: [
          '        run: |',
          '          node scripts/run-gates.mjs --channel ci-pr --parallel 4',
          '          pnpm exec knip',
        ].join('\n'),
        expect: /undeclared run step/,
      },
      {
        name: 'a direct gate chained onto the advisory audit',
        from: AUDIT_LINE,
        to: `${AUDIT_LINE}; pnpm typecheck`,
        expect: /undeclared run step/,
      },
      {
        name: 'runner step skipped with `if: false`',
        from: RUNNER_LINE,
        to: `        if: false\n${RUNNER_LINE}`,
        expect: /runner step .* sets `if`/,
      },
      {
        name: 'runner step made non-blocking with an expression',
        from: RUNNER_LINE,
        to: `${RUNNER_LINE}\n        continue-on-error: \${{ true }}`,
        expect: /runner step .* sets `continue-on-error`/,
      },
      {
        name: 'job skipped with `if: false`',
        from: RUNS_ON_LINE,
        to: `${RUNS_ON_LINE}\n    if: false`,
        expect: /job "gates" sets `if`/,
      },
      {
        name: 'job made non-blocking with `continue-on-error`',
        from: RUNS_ON_LINE,
        to: `${RUNS_ON_LINE}\n    continue-on-error: true`,
        expect: /job "gates" sets `continue-on-error`/,
      },
    ];

    for (const m of MUTATIONS) {
      it(m.name, () => {
        expect(WORKFLOW_YAML.split(/\r?\n/), `anchor line missing: ${m.from}`).toContain(m.from);
        const mutated = WORKFLOW_YAML.replace(m.from, m.to);
        const problems = auditQualityWorkflow(mutated);
        expect(
          problems.some((p) => m.expect.test(p)),
          problems.join('\n'),
        ).toBe(true);
      });
    }
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

describe('check-layout-tests serves a build no other gate can clobber (PR #382 review)', () => {
  // In the parallel ci-pr run, other processes rebuild Vite's default dist/
  // (audit-gates-supportjson probes audit-bundle, whose vite-bundle-visualizer
  // empties dist/ mid-build). If the layout suite previewed dist/, a route could
  // load a 404 shell mid-run. Its Playwright web server therefore builds into,
  // and previews, a directory of its own.
  const webServer = (() => {
    const configUrl = pathToFileURL(join(ROOT, 'playwright.config.ts')).href;
    const r = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const c = (await import(${JSON.stringify(configUrl)})).default;` +
          'process.stdout.write(JSON.stringify(c.webServer ?? null));',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    if (r.status !== 0) throw new Error(`could not load playwright.config.ts:\n${r.stderr}`);
    return JSON.parse(r.stdout);
  })();

  const segments = String(webServer?.command ?? '')
    .split('&&')
    .map((s) => s.trim());
  const build = segments.find((s) => /^pnpm build\b/.test(s));
  const preview = segments.find((s) => /\bvite preview\b/.test(s));
  const outDirOf = (cmd) => cmd?.match(/--outDir[= ](\S+)/)?.[1] ?? null;

  it('builds and then previews in one web server command', () => {
    expect(build, webServer?.command).toBeDefined();
    expect(preview, webServer?.command).toBeDefined();
    expect(segments.indexOf(build)).toBeLessThan(segments.indexOf(preview));
  });

  it('builds into the same outDir it previews', () => {
    expect(outDirOf(build), build).not.toBeNull();
    expect(outDirOf(preview)).toBe(outDirOf(build));
  });

  it('keeps that outDir out of dist/ and out of every tree walk', () => {
    const outDir = posix.normalize(String(outDirOf(build)).replace(/\\/g, '/'));
    expect(outDir === 'dist' || outDir.startsWith('dist/')).toBe(false);
    // node_modules is skipped by git and by every repo tree-walking gate, so the
    // built bundle never reads as source (hardcoded colors, exemptions, …).
    expect(outDir.startsWith('node_modules/')).toBe(true);
  });
});
