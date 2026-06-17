# LLM adapters

Three providers, uniform interface. Customer picks via `llm.provider` in
`automation-config.json`. Hirobius ships all three; never sees customer data
under any of them.

## Why three?

- **Ollama** (default) — local model on customer's hardware. Free. Private. No vendor.
- **Claude** — Anthropic API with the customer's own key. Higher quality on hard semantic work. Customer's contract with Anthropic, customer's bill.
- **None** — refuses all LLM calls. Forces deterministic-only paths. For maximum-privacy postures.

## Common interface

```js
import { getLlmAdapter } from '../_shared/llm/index.mjs';
import { loadRootConfig } from '../_shared/config-loader.mjs';

const adapter = getLlmAdapter(loadRootConfig());

// connectivity check (no real inference)
const probe = await adapter.probe();
//  { ok: true, provider, model, latencyMs, ... }

// inference
const r = await adapter.complete({
  systemPrompt: 'You are an insurance email triage assistant...',
  userMessage:  'From: ...\nSubject: ...\nBody: ...',
  maxTokens: 512,
  temperature: 0.2,
  responseFormat: 'json',   // optional — providers honor where supported
});
//  { text, structured?, usage: { inputTokens, outputTokens, cachedTokens, latencyMs } }
```

## Provider-specific notes

### Ollama
- Reads endpoint + model from `llm.ollama.{endpoint, model}`.
- Probe checks `/api/tags`, confirms the configured model is pulled.
- If the model isn't available, probe returns `ok: false` with the `ollama pull <model>` hint.
- Default model is `gemma3:27b` — runs well on a 24GB+ GPU laptop or modest server.
- For lighter hardware, override to `llama3.2:3b` or `phi-3:mini`.

### Claude
- Reads API key from the env var named in `llm.claude.envKey` (default `ANTHROPIC_API_KEY`).
- Customer sets that env var in their own `.env.local`. Hirobius does not.
- Uses prompt caching (`cache_control: ephemeral`) on the system prompt — ~90% input discount within a 5-minute window.
- Model selection: `claude-sonnet-4-6` for quality work, `claude-haiku-4-5-20251001` for cheap classification.
- `usage.cachedTokens` reports how many input tokens were served from cache.

### None
- `probe()` returns `{ ok: true, ... }` (it's working as designed).
- `complete()` throws. Workflows that try to call it fail loudly — surface this in CI.

## Adding a new provider (OpenAI, Groq, etc.)

1. Copy `claude.mjs` as a starting point (it's the most-similar shape).
2. Implement `probe()` and `complete()` against the new endpoint.
3. Export `<provider>Adapter(cfg)` returning `{ providerName, probe, complete }`.
4. Register in `index.mjs`'s switch.
5. Add a `<provider>` block to `automation-config.json.llm.{...}`.

About 30 lines of work per provider. The interface is intentionally minimal.

## Privacy contract reminder

These adapters are the **only** path through which our code calls an external
inference service. They are how we honor the "we don't touch the data"
promise:

- Ollama: data stays on the customer's hardware.
- Claude: customer's API key, customer's contract, customer's bill — Hirobius is not in the data path.
- None: no external calls at all.

Adapter functions should never log message contents. If you need debugging
output, log structural metadata (`text.length`, `usage`, `latencyMs`) — never
the prompt or response itself.
