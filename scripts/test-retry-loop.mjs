#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/test-retry-loop.mjs
 * Tests the retry loop with a mocked LLM. No network calls.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = path.join(ROOT, 'bridge.config.json');

// Redirect telemetry to a test-only log so fixture-driven retry events
// don't pollute the production stream that orchestrator.checkRetryExhaustion reads.
process.env.TELEMETRY_LOG_PATH ??= path.join(ROOT, 'telemetry', 'test-events.jsonl');

const { runWithRetry } = await import('../pipeline/retry-loop.mjs');

function withRetryEnabled(enabled, fn) {
  const original = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const modified = { ...original, retryLoopEnabled: enabled };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(modified, null, 2));
  return Promise.resolve(fn()).finally(() => {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(original, null, 2));
  });
}

function makeLlmMock(responses) {
  let i = 0;
  return async () => {
    if (i >= responses.length) {
      throw new Error('LLM mock ran out of responses');
    }
    return responses[i++];
  };
}

test('success on first attempt', { concurrency: false }, async () => {
  await withRetryEnabled(true, async () => {
    const callLlm = makeLlmMock([
      JSON.stringify({ jsx: '<HdsButton variant="primary" label="Save" />' }),
    ]);
    const result = await runWithRetry({ callLlm, userPrompt: 'a save button' });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
    assert.equal(result.errors.length, 0);
  });
});

test('success on second attempt after correction', { concurrency: false }, async () => {
  await withRetryEnabled(true, async () => {
    const callLlm = makeLlmMock([
      JSON.stringify({ jsx: '<HdsButton variant="huge" label="Save" />' }),
      JSON.stringify({ jsx: '<HdsButton variant="primary" label="Save" />' }),
    ]);
    const result = await runWithRetry({ callLlm, userPrompt: 'a save button' });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });
});

test('exhausted after MAX_RETRIES failures', { concurrency: false }, async () => {
  await withRetryEnabled(true, async () => {
    const callLlm = makeLlmMock([
      JSON.stringify({ jsx: '<HdsFakeWidget />' }),
      JSON.stringify({ jsx: '<HdsFakeWidget />' }),
      JSON.stringify({ jsx: '<HdsFakeWidget />' }),
    ]);
    const result = await runWithRetry({ callLlm, userPrompt: 'something' });
    assert.equal(result.ok, false);
    assert.equal(result.attempts, 3);
    assert.ok(result.errors.length > 0);
  });
});

test('passthrough when retryLoopEnabled is false', { concurrency: false }, async () => {
  await withRetryEnabled(false, async () => {
    const callLlm = makeLlmMock([
      JSON.stringify({ jsx: '<HdsFakeWidget />' }),
    ]);
    const result = await runWithRetry({ callLlm, userPrompt: 'something' });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 1);
  });
});

test('envelope error is treated as a correctable failure', { concurrency: false }, async () => {
  await withRetryEnabled(true, async () => {
    const callLlm = makeLlmMock([
      'not even json',
      JSON.stringify({ jsx: '<HdsButton variant="primary" label="Save" />' }),
    ]);
    const result = await runWithRetry({ callLlm, userPrompt: 'a button' });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });
});
