/**
 * pipeline/format-correction.mjs
 * Converts validator errors into a corrective LLM prompt.
 *
 * Strategy: include the original JSX verbatim, list errors as numbered
 * items with their code/message/suggestion, end with a strict directive.
 * Do NOT re-send the entire system prompt — that wastes tokens and
 * dilutes the correction signal.
 */

/**
 * @param {object} args
 * @param {string} args.originalJsx - the LLM's previous output
 * @param {Array<{path,code,message,suggestion}>} args.errors
 * @param {number} args.attempt - 1-indexed retry attempt number
 * @returns {string} corrective prompt to send as user message
 */
export function formatCorrection({ originalJsx, errors, attempt }) {
  const errorList = errors
    .map((e, i) => {
      const loc = e.path ? ` at ${e.path}` : '';
      return `${i + 1}. [${e.code}]${loc}: ${e.message}\n   -> ${e.suggestion}`;
    })
    .join('\n');

  return [
    `Your previous output (attempt ${attempt}) failed validation.`,
    '',
    'Original output:',
    originalJsx,
    '',
    `Errors found (${errors.length}):`,
    errorList,
    '',
    'Fix only these issues. Preserve everything else.',
    'Output only the corrected JSX inside the {"jsx": "..."} envelope.',
    'Do not add commentary, do not add markdown, do not change unrelated parts.',
  ].join('\n');
}

export default formatCorrection;
