/**
 * Anthropic Claude adapter — raw fetch, no SDK dep.
 *
 * Customer's API key (ANTHROPIC_API_KEY in their .env.local). Customer's
 * billing relationship with Anthropic. We ship the integration code.
 *
 * Uses prompt caching on the system prompt — ~90% discount on cached input
 * within the 5-minute cache window. This matters when running many threads
 * through the same system prompt (typical for triage / discovery batches).
 *
 * Reference: https://docs.anthropic.com/en/api/messages
 */

export function claudeAdapter(cfg) {
  const endpoint = cfg.endpoint ?? 'https://api.anthropic.com/v1/messages';
  const model    = cfg.model    ?? 'claude-sonnet-4-6';
  const useCache = cfg.useCache !== false;
  const timeout  = cfg.timeoutMs ?? 60_000;
  const envKey   = cfg.envKey   ?? 'ANTHROPIC_API_KEY';

  function getKey() {
    const k = process.env[envKey];
    if (!k) throw new Error(`Claude adapter: env var ${envKey} not set. Customer must provide their own Anthropic API key.`);
    return k;
  }

  async function fetchJson(opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(endpoint, { ...opts, signal: ctrl.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(`claude HTTP ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
      return json;
    } finally { clearTimeout(t); }
  }

  function headers() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': getKey(),
      'anthropic-version': '2023-06-01',
    };
  }

  async function probe() {
    const start = Date.now();
    const json = await fetchJson({
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: 'reply with exactly: ok' }],
      }),
    });
    const text = json.content?.[0]?.text ?? '';
    return {
      ok: text.toLowerCase().includes('ok'),
      provider: 'claude',
      model,
      latencyMs: Date.now() - start,
      sampleResponse: text,
    };
  }

  async function complete({ systemPrompt = '', userMessage = '', maxTokens = 1024, temperature = 0.2, responseFormat }) {
    const messages = [{ role: 'user', content: userMessage }];

    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages,
    };

    if (systemPrompt) {
      body.system = useCache
        ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
        : systemPrompt;
    }

    if (responseFormat === 'json') {
      body.system = (Array.isArray(body.system) ? body.system : [{ type: 'text', text: body.system ?? '' }]);
      body.system.push({ type: 'text', text: 'Respond ONLY with a single JSON object. No prose, no code fences.' });
    }

    const start = Date.now();
    const json = await fetchJson({
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });

    const text = json.content?.[0]?.text ?? '';
    let structured;
    if (responseFormat === 'json') {
      try { structured = JSON.parse(text); } catch { /* leave undefined */ }
    }

    return {
      text,
      structured,
      usage: {
        inputTokens:       json.usage?.input_tokens ?? null,
        outputTokens:      json.usage?.output_tokens ?? null,
        cachedTokens:      json.usage?.cache_read_input_tokens ?? 0,
        cacheCreatedTokens: json.usage?.cache_creation_input_tokens ?? 0,
        latencyMs: Date.now() - start,
      },
    };
  }

  return { providerName: 'claude', probe, complete };
}
