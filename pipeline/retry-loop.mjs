/**
 * pipeline/retry-loop.mjs
 * Wraps an LLM call with validation + retry. Reads retryLoopEnabled
 * from bridge.config.json. Logs every attempt to telemetry.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validate } from '../validators/index.mjs';
import { formatCorrection } from './format-correction.mjs';
import { log } from '../telemetry/logger.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_RETRIES = 3;

function loadFlags() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'bridge.config.json'), 'utf8'));
  } catch {
    return { retryLoopEnabled: false };
  }
}

/**
 * Execute the LLM call inside a validate-and-retry loop.
 *
 * @param {object} args
 * @param {function(string): Promise<string>} args.callLlm
 *   Function that takes a user message and returns the LLM's JSX output.
 *   The first call receives the original user prompt.
 *   Retry calls receive a corrective prompt from formatCorrection.
 * @param {string} args.userPrompt - the original user request
 * @param {function(string): string} [args.extractJsx]
 *   Pulls the JSX string out of the LLM envelope. Defaults to
 *   parsing {"jsx": "..."} JSON. Override for raw-text models.
 * @returns {Promise<{ ok: boolean, jsx: string, attempts: number, errors: Array<{path, code, message, suggestion}> }>}
 */
export async function runWithRetry({ callLlm, userPrompt, extractJsx, source }) {
  const flags = loadFlags();
  const extract = extractJsx || defaultExtractJsx;

  log('retry.start', { promptLength: userPrompt.length, enabled: flags.retryLoopEnabled, source });

  let currentPrompt = userPrompt;
  let lastJsx = '';
  let lastErrors = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    log('retry.attempt', { attempt, promptLength: currentPrompt.length });

    let raw;
    try {
      raw = await callLlm(currentPrompt);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('retry.llm_error', { attempt, error: message });
      return {
        ok: false,
        jsx: lastJsx,
        attempts: attempt,
        errors: [{
          path: '',
          code: 'LLM_ERROR',
          message,
          suggestion: 'Check Ollama is running',
        }],
      };
    }

    let jsx;
    try {
      jsx = extract(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('retry.extract_error', { attempt, error: message, raw: raw.slice(0, 200) });
      lastErrors = [{
        path: '',
        code: 'ENVELOPE_ERROR',
        message,
        suggestion: 'Output must be valid JSON: {"jsx": "..."}',
      }];
      currentPrompt = formatCorrection({ originalJsx: raw, errors: lastErrors, attempt });
      continue;
    }

    lastJsx = jsx;

    if (!flags.retryLoopEnabled) {
      log('retry.disabled_passthrough', { attempt });
      return { ok: true, jsx, attempts: attempt, errors: [] };
    }

    const result = await validate(jsx);
    log('retry.validate', { attempt, ok: result.ok, errorCount: result.errors.length });

    if (result.ok) {
      log('retry.success', { attempt });
      return { ok: true, jsx, attempts: attempt, errors: [] };
    }

    lastErrors = result.errors;

    if (attempt < MAX_RETRIES) {
      currentPrompt = formatCorrection({ originalJsx: jsx, errors: result.errors, attempt });
    }
  }

  log('retry.exhausted', { attempts: MAX_RETRIES, errorCount: lastErrors.length });
  return { ok: false, jsx: lastJsx, attempts: MAX_RETRIES, errors: lastErrors };
}

/**
 * Default envelope extractor - handles {"jsx": "..."} JSON.
 * @param {string} raw
 * @returns {string}
 */
function defaultExtractJsx(raw) {
  const trimmed = raw.trim();
  const cleaned = trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.jsx !== 'string') {
    throw new Error('Envelope missing "jsx" string field');
  }
  return parsed.jsx;
}

export default runWithRetry;
