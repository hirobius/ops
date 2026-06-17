/**
 * scripts/lib/precommit-canonical.mjs
 *
 * Shared canonicalization utility for .husky/pre-commit structural hashing.
 *
 * Canonical form rules (order matters):
 *   1. Strip lines matching /^\s*#/  (comment-only lines)
 *   2. Strip blank lines (after comment removal)
 *   3. Collapse runs of whitespace within each remaining line to a single space
 *   4. Trim trailing whitespace per line
 *
 * Then SHA-256 the canonical UTF-8 bytes → lowercase hex digest.
 *
 * This intentionally ignores comment changes so minor annotation
 * updates don't force a registry hash update. Only structural changes
 * (gate additions, removals, reorderings) trigger drift.
 */

import crypto from 'node:crypto';

/**
 * Produce the canonical text form of a pre-commit hook file.
 * @param {string} rawContent - raw UTF-8 content of .husky/pre-commit
 * @returns {string} canonical text (join with \n)
 */
export function canonicalizePrecommit(rawContent) {
  return rawContent
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))       // strip comment-only lines
    .filter((l) => l.trim() !== '')          // strip blank lines
    .map((l) => l.replace(/\s+/g, ' ').trimEnd()) // collapse whitespace, trim trailing
    .join('\n');
}

/**
 * Compute the canonical SHA-256 hex digest of a pre-commit hook's content.
 * @param {string} rawContent - raw UTF-8 content of .husky/pre-commit
 * @returns {string} lowercase 64-char hex digest
 */
export function hashPrecommit(rawContent) {
  const canonical = canonicalizePrecommit(rawContent);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}
