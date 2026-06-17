/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/index.mjs
 * Orchestrates all validators in sequence.
 * This is the only export the pipeline imports — individual
 * validators are internal implementation details.
 *
 * Short-circuits on parse failure.
 * Aggregates all errors from all validators into one result.
 */

import { parse } from './parse-jsx.mjs';
import manifestValidator from './manifest-validator.mjs';
import tokenValidator from './token-validator.mjs';
import a11yValidator from './a11y-validator.mjs';
import swissCanonValidator from './swiss-canon.mjs';
import bindingCompletenessValidator from './binding-completeness.mjs';
import motionPerfValidator from './motion-perf.mjs';

/**
 * @param {string} jsxString
 * @returns {{ ok: boolean, errors: Array<{path, code, message, suggestion}> }}
 */
async function validate(jsxString) {
  const parsed = parse(jsxString);
  if (!parsed.ok) {
    return { ok: false, errors: [{ path: '', code: 'PARSE_ERROR', message: parsed.error, suggestion: 'Fix JSX syntax before re-validating' }] };
  }

  const [manifestResult, tokenResult, a11yResult, swissResult, bindingResult, motionResult] = await Promise.all([
    manifestValidator(jsxString),
    tokenValidator(jsxString),
    a11yValidator(jsxString),
    swissCanonValidator(jsxString),
    bindingCompletenessValidator(jsxString),
    motionPerfValidator(jsxString),
  ]);

  const errors = [
    ...manifestResult.errors,
    ...tokenResult.errors,
    ...a11yResult.errors,
    ...swissResult.errors,
    ...bindingResult.errors,
    ...motionResult.errors,
  ];

  return { ok: errors.length === 0, errors };
}

// Default export so fixture test loader (scripts/run-validator-tests.mjs) can
// call it as a function via the `.default ?? module` fallback.
export default validate;
// Named export for consumers that import as { validate } (e.g. pipeline/retry-loop.mjs)
export { validate };
