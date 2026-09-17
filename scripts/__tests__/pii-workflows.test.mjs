/**
 * Contracts for .github/workflows/pii-scan.yml and pii-weekly.yml — pins the
 * decisions that make the PII scans trustworthy in a public repo, so a later
 * "simplification" cannot quietly undo one (ops#27, ops#35).
 *
 * Assertions run on comment-stripped YAML: a comment mentioning a flag is not
 * the same as passing it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripYamlComments } from '../lib/yaml-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (name) =>
  stripYamlComments(readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8'));

describe('pii-scan workflow (every PR and push to main)', () => {
  const workflow = load('pii-scan.yml');

  it('runs on pull requests and pushes to main with full history and read-only contents', () => {
    expect(workflow).toMatch(/^\s*pull_request:/m);
    expect(workflow).toMatch(/^\s*push:\s*\n\s*branches:\s*\[main\]/m);
    expect(workflow).toMatch(/fetch-depth:\s*0/);
    expect(workflow).toMatch(/persist-credentials:\s*false/);
    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read\s*\n/);
  });

  it('scans the event range with annotations, handing the denylist over only as a secret', () => {
    expect(workflow).toMatch(/node scripts\/check-pii\.mjs --github-event --github/);
    expect(workflow).toMatch(/PII_DENYLIST:\s*\$\{\{\s*secrets\.PII_DENYLIST\s*\}\}/);
    expect(workflow).not.toMatch(/continue-on-error/);
  });
});

describe('pii-weekly workflow (warn-only sweep)', () => {
  const workflow = load('pii-weekly.yml');

  it('runs weekly and on demand with read-only permissions', () => {
    expect(workflow).toMatch(/schedule:\s*\n\s*-\s*cron:\s*'[^']+'/);
    expect(workflow).toMatch(/^\s*workflow_dispatch:/m);
    expect(workflow).toMatch(/contents:\s*read/);
    expect(workflow).toMatch(/issues:\s*read/);
    expect(workflow).toMatch(/pull-requests:\s*read/);
    expect(workflow).not.toMatch(/:\s*write\b/);
  });

  it('scans ops issue and PR text from the last 8 days, failing on any finding', () => {
    expect(workflow).toMatch(
      /node scripts\/pii-fetch-github-text\.mjs --repo hirobius\/ops --since-days 8 --out "\$RUNNER_TEMP\/[^"]+"/,
    );
    expect(workflow).toMatch(
      /check-pii\.mjs --records "\$RUNNER_TEMP\/[^"]+"[^\n]*--fail-on warn[^\n]*--github/,
    );
  });

  it('scans the portal-kit and site-engine tips without keeping credentials', () => {
    for (const repo of ['portal-kit', 'site-engine']) {
      expect(workflow).toMatch(new RegExp(`repository:\\s*hirobius/${repo}`));
      expect(workflow).toMatch(
        new RegExp(`check-pii\\.mjs --tree external/${repo}[^\\n]*--github`),
      );
    }
    expect(workflow.match(/persist-credentials:\s*false/g)?.length).toBe(3);
  });

  it('still scans the repo tips when fetching issue text fails', () => {
    expect(workflow).toMatch(/id:\s*fetch\s*\n\s*continue-on-error:\s*true/);
    expect(workflow).toMatch(/id:\s*text\s*\n\s*if:\s*steps\.fetch\.outcome == 'success'/);
  });

  it('passes the denylist secret to the scans and turns the job red when any scan found something', () => {
    expect(workflow).toMatch(/PII_DENYLIST:\s*\$\{\{\s*secrets\.PII_DENYLIST\s*\}\}/);
    expect(workflow).toMatch(/steps\.fetch\.outcome == 'failure'/);
    expect(workflow).toMatch(/steps\.text\.outcome == 'failure'/);
    expect(workflow).toMatch(/steps\.portal_kit\.outcome == 'failure'/);
    expect(workflow).toMatch(/steps\.site_engine\.outcome == 'failure'/);
  });
});
