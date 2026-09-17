#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/secret-scan-range.mjs
 *
 * Works out which commits the CI secret scan (.github/workflows/secret-scan.yml)
 * covers for a GitHub Actions event. The answer is handed to
 * `gitleaks git --log-opts`, which passes it to `git log -p` (ops#32).
 *
 *   pull_request       base..head      only what the PR adds
 *   push (to main)     before..after   only what the push adds; if `before` is
 *                                      all zeros or missing from the clone (the
 *                                      history was rewritten), fall back to the
 *                                      pushed tip alone, with a warning
 *   workflow_dispatch  HEAD            full history of the ref, run on demand
 *
 * Why scan only the change range: a full-history scan on every PR would turn one
 * historic finding into a check nobody can make green from their own PR.
 *
 * Why check that commits exist before scanning: gitleaks hands a bad revision to
 * git log and reports "0 commits scanned" as a clean pass (confirmed with
 * 8.30.1). A shallow checkout would then look like a clean scan. Any commit the
 * range needs that is missing from the clone fails the step with a message
 * naming the fix. SHAs must be 40-char hex for the same reason, and because the
 * range is passed to git as options.
 *
 * Known limit: like any `git log -p` scan, a merge commit's own conflict
 * resolution is not diffed. The commits being merged are.
 *
 * Not a registry gate: it is a CI helper, not a scripts/check-* or audit-*
 * validator, so validate-guardrail-registry does not require an entry.
 *
 * Usage (inside Actions, which sets all three env vars):
 *   node scripts/secret-scan-range.mjs   → appends `log_opts=<range>` to $GITHUB_OUTPUT
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ZERO_SHA = /^0{40}$/;

function assertSha(value, role) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new Error(`The ${role} value ${JSON.stringify(value)} is not a 40-character commit SHA.`);
  }
  return value;
}

function requireCommit(sha, role, commitExists) {
  if (!commitExists(sha)) {
    throw new Error(
      `The ${role} commit ${sha} is not in this clone, so the secret scan cannot see it. ` +
        'Check out with `fetch-depth: 0` (actions/checkout) so the full history is present.',
    );
  }
}

export function resolveScanRange({ eventName, payload, commitExists = () => true }) {
  if (eventName === 'pull_request') {
    const base = assertSha(payload.pull_request?.base?.sha, 'pull request base');
    const head = assertSha(payload.pull_request?.head?.sha, 'pull request head');
    requireCommit(base, 'pull request base', commitExists);
    requireCommit(head, 'pull request head', commitExists);
    return { logOpts: `${base}..${head}` };
  }
  if (eventName === 'push') {
    const before = assertSha(payload.before, 'push before');
    const after = assertSha(payload.after, 'push after');
    requireCommit(after, 'pushed tip', commitExists);
    if (ZERO_SHA.test(before) || !commitExists(before)) {
      return {
        logOpts: `-1 ${after}`,
        warning: `Previous tip ${before} is not usable — scanning only the pushed tip ${after}.`,
      };
    }
    return { logOpts: `${before}..${after}` };
  }
  if (eventName === 'workflow_dispatch') {
    return { logOpts: 'HEAD' };
  }
  throw new Error(
    `There is no scan range rule for the "${eventName}" event. ` +
      'Supported: pull_request, push, workflow_dispatch — add a rule in scripts/secret-scan-range.mjs before triggering on it.',
  );
}

function commitExistsInClone(sha) {
  return spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' }).status === 0;
}

function main() {
  try {
    const missing = ['GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH', 'GITHUB_OUTPUT'].filter(
      (name) => !process.env[name],
    );
    if (missing.length > 0) {
      throw new Error(
        `${missing.join(', ')} not set. This script runs as a GitHub Actions step, which provides them.`,
      );
    }
    const payload = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const { logOpts, warning } = resolveScanRange({
      eventName: process.env.GITHUB_EVENT_NAME,
      payload,
      commitExists: commitExistsInClone,
    });
    if (warning) console.log(`::warning title=Secret scan range::${warning}`);
    console.log(`Secret scan range (git log options): ${logOpts}`);
    appendFileSync(process.env.GITHUB_OUTPUT, `log_opts=${logOpts}\n`);
  } catch (err) {
    console.log(`::error title=Secret scan range::${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
