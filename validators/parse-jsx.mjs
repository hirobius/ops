/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/parse-jsx.mjs
 * Parses a JSX string into an AST using acorn + acorn-jsx.
 * This is the only file that imports acorn. All other validators
 * receive a pre-parsed AST from this module.
 */

import * as acorn from 'acorn';
import jsx from 'acorn-jsx';

const parser = acorn.Parser.extend(jsx());

/**
 * Parse a JSX string into an AST.
 * @param {string} jsxString
 * @returns {{ ok: boolean, ast?: object, error?: string }}
 */
export function parse(jsxString) {
  try {
    const ast = parser.parse(jsxString, {
      ecmaVersion: 2020,
      sourceType: 'module',
      allowImportExportEverywhere: true,
    });
    return { ok: true, ast };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Default export for the test runner.
 * @param {string} jsxString
 * @returns {{ ok: boolean, error?: string }}
 */
export default async function validate(jsxString) {
  const { ok, error } = parse(jsxString);
  return ok ? { ok: true } : { ok: false, error };
}
