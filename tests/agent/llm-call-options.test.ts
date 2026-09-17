// @vitest-environment node
/**
 * tests/agent/llm-call-options.test.ts — ops#7.
 *
 * The model eval needs two things from the one place every stage calls the API:
 * the real token usage of each call (cost is measured, never estimated), and a
 * way to pass `thinking` so an arm can try Sonnet 5 with thinking disabled.
 * Both are opt-in, so a production call that sets neither is byte-for-byte the
 * request it was before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: (...args: unknown[]) => create(...args) };
  },
}));

const { callStructuredTool } = await import('../../lib/agent/llm.mjs');

const USAGE = {
  input_tokens: 1200,
  output_tokens: 800,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

const toolResponse = (input: unknown) => ({
  content: [{ type: 'tool_use', name: 'record', input }],
  stop_reason: 'tool_use',
  usage: USAGE,
});

const BASE = {
  model: 'claude-sonnet-5',
  system: 'sys',
  user: 'hello',
  toolName: 'record',
  toolDescription: 'Record it.',
  inputSchema: { type: 'object' },
};

beforeEach(() => create.mockReset());

describe('callStructuredTool options', () => {
  it('sends no thinking field unless one is given (production requests unchanged)', async () => {
    create.mockResolvedValueOnce(toolResponse({ ok: true }));
    await callStructuredTool(BASE);
    expect(create.mock.calls[0][0]).not.toHaveProperty('thinking');
  });

  it('passes thinking through when an arm sets it', async () => {
    create.mockResolvedValueOnce(toolResponse({ ok: true }));
    await callStructuredTool({ ...BASE, thinking: { type: 'disabled' } });
    expect(create.mock.calls[0][0].thinking).toEqual({ type: 'disabled' });
  });

  it('reports the model, real usage and stop reason to onUsage', async () => {
    create.mockResolvedValueOnce(toolResponse({ ok: true }));
    const onUsage = vi.fn();
    const out = await callStructuredTool({ ...BASE, onUsage });
    expect(out).toEqual({ ok: true });
    expect(onUsage).toHaveBeenCalledWith({
      model: 'claude-sonnet-5',
      usage: USAGE,
      stopReason: 'tool_use',
    });
  });

  it('still reports usage when the model returns no tool call — that spend was real', async () => {
    create.mockResolvedValueOnce({ content: [], stop_reason: 'max_tokens', usage: USAGE });
    const onUsage = vi.fn();
    await expect(callStructuredTool({ ...BASE, onUsage })).rejects.toThrow(/max_tokens/);
    expect(onUsage).toHaveBeenCalledTimes(1);
  });
});
