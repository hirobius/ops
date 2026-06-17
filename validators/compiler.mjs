/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/compiler.mjs
 * Fixture-runner adapter for the JSX→ADD_NODE compiler.
 *
 * The compiler's own API (scripts/hds-jsx-compiler.mjs#compile) returns the
 * command array directly. This wrapper shapes it as { ok, commands } so the
 * fixture test runner can deep-equal against an `expected.commands` field
 * the same way it does for the other validators' `errors` field.
 */

import { compile } from '../scripts/hds-jsx-compiler.mjs';

export default function validate(jsxString) {
  const commands = compile(jsxString);
  return { ok: true, commands };
}
