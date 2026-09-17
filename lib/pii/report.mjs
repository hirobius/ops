/**
 * lib/pii/report — render PII findings for a terminal, GitHub annotations and
 * a job summary, without ever including a matched value.
 *
 * Findings reach this module already value-free (lib/pii/detect.mjs never
 * returns the match). The one remaining leak is a LOCATION: a file path can
 * itself carry a client's name (`clients/<slug>/…`, a preview named after a
 * person). Callers pass such paths through `redactPath` first.
 *
 * @module pii/report
 */

import { createHash } from 'node:crypto';

/** Where a person who hit the gate should read next. */
export const GUIDE = 'docs/guardrails/pii-gate.md';

/** GitHub Actions secrets settings for hirobius/ops. */
export const SECRETS_URL = 'https://github.com/hirobius/ops/settings/secrets/actions';

const SEVERITY_RANK = { warn: 1, error: 2 };

/**
 * True when a finding is at or above the failure threshold.
 *
 * @param {{ severity: string }} finding
 * @param {'error'|'warn'} failOn
 */
export function isFailing(finding, failOn) {
  return (SEVERITY_RANK[finding.severity] ?? 0) >= (SEVERITY_RANK[failOn] ?? 2);
}

/**
 * A stand-in for a path that matched the denylist: stable (so a person can
 * compare it with `git ls-files | sha256sum`-style tooling) but reveals nothing.
 *
 * @param {string} path
 */
export function redactPath(path) {
  const digest = createHash('sha256').update(path).digest('hex').slice(0, 12);
  return `[path redacted: matches the denylist, sha256 ${digest}]`;
}

/** `path:line:col`, or just the label when there is no line. */
function formatLocation(finding) {
  if (finding.line == null) return finding.path;
  return `${finding.path}:${finding.line}:${finding.column}`;
}

/** What fired, in words, with the match masked. */
function describeFinding(finding) {
  const what = finding.rule === 'denylist' ? finding.detail : `${finding.rule}: ${finding.detail}`;
  const size = finding.length ? `value redacted, ${finding.length} chars` : 'value redacted';
  return `${what} (${size})`;
}

/** One terminal line. */
export function formatFindingLine(finding) {
  const mark = finding.severity === 'error' ? '✗ error' : '⚠ warn ';
  return `  ${mark}  ${formatLocation(finding)}  ${describeFinding(finding)}`;
}

/**
 * A GitHub workflow command annotating one finding. `file`/`line` properties
 * are attached only for findings in this repository's files, so a location in
 * issue text or another repo does not point at a wrong file.
 *
 * @param {object} finding
 * @param {{ inRepoFile: boolean }} options
 */
export function toAnnotation(finding, { inRepoFile }) {
  const command = finding.severity === 'error' ? 'error' : 'warning';
  const props = [];
  if (inRepoFile && finding.line != null) {
    props.push(
      `file=${escapeProperty(finding.path)}`,
      `line=${finding.line}`,
      `col=${finding.column}`,
    );
  }
  props.push(`title=${escapeProperty(`PII ${finding.rule}`)}`);
  const message = inRepoFile
    ? `${describeFinding(finding)}. See ${GUIDE}`
    : `${formatLocation(finding)}: ${describeFinding(finding)}. See ${GUIDE}`;
  return `::${command} ${props.join(',')}::${escapeData(message)}`;
}

/**
 * Markdown for $GITHUB_STEP_SUMMARY.
 *
 * @param {object} options
 * @param {string} options.label
 * @param {object[]} options.findings
 * @param {'error'|'warn'} options.failOn
 * @param {string[]} options.notices     already-worded notices (markdown)
 * @param {number} [options.maxRows]
 */
export function summaryMarkdown({ label, findings, failOn, notices, maxRows = 100 }) {
  const failing = findings.filter((f) => isFailing(f, failOn));
  const verdict = failing.length > 0 ? `❌ ${failing.length} failing` : '✅ no failing findings';
  const lines = [`### PII scan: ${escapeMd(label)}`, '', `${verdict} (fails on: ${failOn})`, ''];
  for (const notice of notices) lines.push(`> [!WARNING]`, `> ${notice}`, '');
  if (findings.length > 0) {
    lines.push('| Severity | Rule | Location | Match |', '| --- | --- | --- | --- |');
    for (const f of findings.slice(0, maxRows)) {
      lines.push(
        `| ${f.severity} | ${escapeMd(f.rule === 'denylist' ? f.detail : `${f.rule}: ${f.detail}`)} | \`${escapeMd(formatLocation(f))}\` | redacted, ${f.length ?? '?'} chars |`,
      );
    }
    if (findings.length > maxRows)
      lines.push('', `…and ${findings.length - maxRows} more (see the job log).`);
    lines.push('', `Handling a hit: \`${GUIDE}\`.`);
  }
  return lines.join('\n') + '\n\n';
}

function escapeData(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(s) {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function escapeMd(s) {
  return String(s).replace(/\|/g, '\\|').replace(/`/g, "'");
}
