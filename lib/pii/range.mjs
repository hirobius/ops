/**
 * lib/pii/range — which commits a PII scan covers.
 *
 * Same policy as the CI secret scan (ops#32): scan only what a pull request or
 * push ADDS. A full-history scan on every PR would turn one historic finding
 * (and ops main still carries some until the ops#27 rewrite lands) into a red
 * check nobody can fix from their own PR.
 *
 *   pull_request   diff base...head   (merge-base to head)   log base..head
 *   push           diff before...after                      log before..after
 *                  no usable `before` (new branch, rewritten history):
 *                  the pushed tip commit alone, with a warning
 *
 * Returned args go straight to `git diff` / `git log` via execFile (no shell).
 * SHAs must be 40-char hex and local refs may not start with `-`, so nothing
 * here can be read as a git option.
 *
 * @module pii/range
 */

/** git's well-known empty tree (SHA-1 repos): the "parent" of a root commit. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const SHA = /^[0-9a-f]{40}$/;
const ZERO_SHA = /^0{40}$/;
const REF = /^[^\s-][^\s]*$/;

/**
 * @typedef {object} ScanRange
 * @property {string[]} diffArgs  revision args for `git diff`
 * @property {string[]} logArgs   revision args for `git log` (commit messages)
 * @property {string} [warning]
 */

/**
 * Resolve the scan range for a GitHub Actions event.
 *
 * @param {object} options
 * @param {string} options.eventName
 * @param {any} options.payload                          parsed $GITHUB_EVENT_PATH
 * @param {(sha: string) => boolean} options.commitExists
 * @param {(sha: string) => boolean} options.hasParent
 * @returns {ScanRange}
 */
export function resolveEventRange({ eventName, payload, commitExists, hasParent }) {
  if (eventName === 'pull_request') {
    const base = assertSha(payload?.pull_request?.base?.sha, 'pull request base');
    const head = assertSha(payload?.pull_request?.head?.sha, 'pull request head');
    requireCommit(base, 'pull request base', commitExists);
    requireCommit(head, 'pull request head', commitExists);
    return { diffArgs: [`${base}...${head}`], logArgs: [`${base}..${head}`] };
  }
  if (eventName === 'push') {
    const before = assertSha(payload?.before, 'push before');
    const after = assertSha(payload?.after, 'push after');
    requireCommit(after, 'pushed tip', commitExists);
    if (ZERO_SHA.test(before) || !commitExists(before)) {
      return {
        diffArgs: hasParent(after) ? [`${after}^1`, after] : [EMPTY_TREE, after],
        logArgs: ['-1', after],
        warning: `Previous tip ${before} is not usable, so only the pushed tip ${after} was scanned.`,
      };
    }
    return { diffArgs: [`${before}...${after}`], logArgs: [`${before}..${after}`] };
  }
  throw new Error(
    `There is no PII scan range rule for the "${eventName}" event. ` +
      'Supported: pull_request, push. Add a rule in lib/pii/range.mjs before triggering on it.',
  );
}

/**
 * Read a local `A..B` spec as "what B adds since it forked from A".
 *
 * @param {string} spec
 * @returns {ScanRange}
 */
export function parseRangeSpec(spec) {
  const parts = String(spec ?? '').split('..');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    throw new Error(
      `--range expects A..B (for example origin/main..HEAD), got ${JSON.stringify(spec)}.`,
    );
  }
  for (const ref of parts) {
    if (!REF.test(ref) || ref.startsWith('.')) {
      throw new Error(`${JSON.stringify(ref)} is not a git ref this scan accepts.`);
    }
  }
  const [from, to] = parts;
  return { diffArgs: [`${from}...${to}`], logArgs: [`${from}..${to}`] };
}

function assertSha(value, role) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new Error(`The ${role} value ${JSON.stringify(value)} is not a 40-character commit SHA.`);
  }
  return value;
}

function requireCommit(sha, role, commitExists) {
  if (!commitExists(sha)) {
    throw new Error(
      `The ${role} commit ${sha} is not in this clone, so the PII scan cannot see it. ` +
        'Check out with `fetch-depth: 0` (actions/checkout) so the full history is present.',
    );
  }
}
