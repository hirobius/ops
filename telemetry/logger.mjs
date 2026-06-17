/**
 * telemetry/logger.mjs
 * Append-only JSONL event logger. All pipeline stages log through this.
 * Do not import this in browser or Figma plugin code.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const LOG_PATH = process.env.TELEMETRY_LOG_PATH ?? path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'events.jsonl'
);

/**
 * @param {string} event  — short verb, e.g. 'generate.start', 'validate.fail'
 * @param {object} data   — arbitrary structured payload
 */
export function log(event, data = {}) {
  const entry = JSON.stringify({ ts: new Date().toISOString(), event, data });
  try {
    fs.appendFileSync(LOG_PATH, entry + '\n', 'utf8');
  } catch {
    // Never let logging crash the pipeline
  }
}
