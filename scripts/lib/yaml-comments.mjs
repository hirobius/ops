/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/lib/yaml-comments.mjs
 *
 * Strip YAML comments from workflow content before substring-matching it.
 *
 * Why this exists (ops#262, ops#304): check-validator-wiring decides a gate's
 * real firing channel by substring-matching gate script names against the
 * concatenated text of .github/workflows/*.yml. That text included comments,
 * so a *prose mention* of a script name read as live wiring.
 *
 * ops#260 added a comment to quality.yml mentioning `audit-sbom`. The matcher
 * saw it, emitted a WIRING_DRIFT finding, and — because run-gates.mjs fails the
 * pre-commit hook on any non-zero exit regardless of the gate's severity — that
 * single false positive blocked every commit to the repository until a human
 * diagnosed it. A Ralph iteration hit the wall and could not proceed.
 *
 * .husky hook files were already comment-stripped (parseHookLines in
 * check-validator-wiring); the GitHub Actions path was not. This closes that gap.
 *
 * Deliberately NOT a YAML parser. It only needs to answer "is this script name
 * mentioned in executable content or in prose?", so a quote-aware scan of `#`
 * is sufficient and has no dependency cost (Node built-ins only, per CLAUDE.md).
 *
 * @module yaml-comments
 */

/**
 * Remove comments from YAML content, preserving `#` inside quoted strings.
 *
 * Line structure is preserved (a stripped line becomes empty, not absent) so
 * any line numbers derived from the result still line up with the source.
 *
 * @param {string} content raw YAML text
 * @returns {string} the same text with comment spans removed
 */
export function stripYamlComments(content) {
  if (typeof content !== 'string' || content === '') return '';

  return content
    .split('\n')
    .map((line) => {
      let quote = null; // "'" or '"' while inside a quoted scalar

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (quote) {
          // YAML escapes only apply inside double quotes.
          if (quote === '"' && ch === '\\') {
            i++;
            continue;
          }
          if (ch === quote) quote = null;
          continue;
        }

        if (ch === '"' || ch === "'") {
          quote = ch;
          continue;
        }

        // A '#' starts a comment only at the start of the line or after
        // whitespace — `foo#bar` is a value, not a comment.
        if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
          return line.slice(0, i).trimEnd();
        }
      }

      return line;
    })
    .join('\n');
}
