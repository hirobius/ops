/**
 * Ollama adapter — local HTTP, no SDK dep.
 *
 * Customer runs Ollama on their machine (or VPS). All inference is local;
 * data never leaves their hardware. Free.
 *
 * Probe via /api/tags. Complete via /api/chat (non-streaming).
 */

export function ollamaAdapter(cfg) {
  const endpoint = cfg.endpoint ?? 'http://localhost:11434';
  const model    = cfg.model    ?? 'gemma3:27b';
  const timeout  = cfg.timeoutMs ?? 120_000;

  async function fetchJson(url, opts = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(`ollama HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
      return json;
    } finally { clearTimeout(t); }
  }

  async function probe() {
    const start = Date.now();
    const tags = await fetchJson(`${endpoint}/api/tags`);
    const models = (tags.models ?? []).map(m => m.name);
    const ok = models.includes(model) || models.some(m => m.startsWith(model.split(':')[0]));
    return {
      ok,
      provider: 'ollama',
      endpoint,
      model,
      modelsAvailable: models,
      latencyMs: Date.now() - start,
      note: ok ? 'model available' : `model "${model}" not pulled — run: ollama pull ${model}`,
    };
  }

  async function complete({ systemPrompt = '', userMessage = '', maxTokens = 1024, temperature = 0.2, responseFormat }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userMessage });

    const body = {
      model,
      messages,
      stream: false,
      options: { temperature, num_predict: maxTokens },
    };
    if (responseFormat === 'json') body.format = 'json';

    const start = Date.now();
    const json = await fetchJson(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = json.message?.content ?? '';
    let structured;
    if (responseFormat === 'json') {
      try { structured = JSON.parse(text); } catch { /* leave undefined */ }
    }

    return {
      text,
      structured,
      usage: {
        inputTokens:  json.prompt_eval_count ?? null,
        outputTokens: json.eval_count ?? null,
        cachedTokens: 0,
        latencyMs: Date.now() - start,
      },
    };
  }

  return { providerName: 'ollama', probe, complete };
}
