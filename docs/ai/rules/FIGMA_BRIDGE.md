# 🌉 HDS Figma Bridge Standards

Authoritative rules for the bridge server, the Figma plugin, and the generative pipeline that connects them. Read this file before editing `scripts/hds-bridge.mjs`, `scripts/llm-stream-bridge.mjs`, `scripts/generate-to-figma.mjs`, `scripts/hds-jsx-compiler.mjs`, or anything inside `figma-agent-plugin/`.

## 1. Architecture

Three processes, one local network. No remote calls except the Iconify SVG fetch.

| Process   | Surface                            | Default URL                   | Owns                                                                                                                   |
| --------- | ---------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bridge    | Express + SSE                      | `http://localhost:3005`       | Source-of-truth for in-flight state: selection tree, pending component payload, manifest read/write, command broadcast |
| Plugin    | Figma sandbox                      | runs inside Figma desktop/web | Canvas writes, selection extraction, font loading, variable binding                                                    |
| Generator | CLI (`pnpm ui:gen`, `pnpm ui:fix`) | local Node process            | LLM I/O, JSX compilation, JSONL POST to bridge                                                                         |
| LLM       | Ollama                             | `http://localhost:11434`      | Currently `hermes3` via `HDS_LLM_MODEL`; JSON mode via `HDS_LLM_FORMAT=json`                                           |

Data flow for generation: **CLI → LLM → CLI parses envelope → JSX compiler → JSONL POST `/generate` → bridge broadcasts on `/stream` → plugin applies to canvas.**

Data flow for fix mode: **plugin selection change → POST `/selection` → CLI GET `/selection` → LLM with selection context → same generative path.**

## 2. Endpoint Catalog

All endpoints are bound to port 3005 and currently accept any localhost origin (`cors()` with default config). Authentication is the next milestone; see §6.

### Stream

| Method | Path      | Purpose                                                       | Body / Response                                                         |
| ------ | --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `GET`  | `/stream` | Server-sent events feed for the plugin and any other listener | text/event-stream; emits `ready`, `node`, `plugin-message`, `heartbeat` |

### Generative

| Method | Path        | Purpose                                                                              | Body / Response                                                                                                                                 |
| ------ | ----------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/generate` | JSONL ingest from the CLI; each valid line is parsed and broadcast as a `node` event | newline-delimited JSON; one command per line; responds `200` (all accepted) or `207` (partial) with `{ accepted, rejected, clients, sequence }` |

### Canvas state

| Method | Path              | Purpose                                                    | Body / Response                                             |
| ------ | ----------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| `POST` | `/selection`      | Plugin pushes the current selection tree                   | `{ tree, timestamp }`; tree shape per §4                    |
| `GET`  | `/selection`      | CLI fetches the cached selection for fix-mode prompting    | last-write-wins; returns `{}` when empty                    |
| `POST` | `/plugin-message` | CLI or any tool fans a typed message to the plugin via SSE | `{ type, ...payload }`; broadcast as `plugin-message` event |

### Component payload

| Method | Path                       | Purpose                                                          | Body / Response                                    |
| ------ | -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `POST` | `/store-component-payload` | Playwright extractor stores a single component's serialized tree | `{ component, ... }`; in-memory, last-write-wins   |
| `GET`  | `/get-component-payload`   | Plugin fetches the pending payload during scaffold               | `404` if none pending; otherwise the stored object |

### Manifest & plugin source

| Method | Path                   | Purpose                                                                                               | Body / Response                                                                 |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET`  | `/get-manifest`        | Read `public/hds-manifest.json` from disk                                                             | the manifest JSON                                                               |
| `POST` | `/update-manifest`     | Upsert tokens into the manifest by `path` (fallback `name`) across primitive/semantic/component tiers | `{ tokens: [...] }`; responds `{ status, upserted, inserted }`                  |
| `GET`  | `/plugin-source/:file` | Whitelisted runtime require for plugin-side modules (`sync-tokens.js`, etc.)                          | only filenames matching `/^[\w.-]+\.js$/` are served from `figma-agent-plugin/` |

### Master generation (Phase A1–A5)

| Method | Path             | Purpose                                                                                                               | Body / Response                                                                                                                                             |
| ------ | ---------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/build-masters` | Build the cartesian-variant batch via `pipeline/figma-masters-batch.mjs` and broadcast `draw-component` to the plugin | empty body; responds `200 { status: 'ok', components, states, clients, sequence }` or `409 { status: 'no-clients' }` if no plugin is connected to `/stream` |

The plugin's `draw-component` handler reads `componentProperties[]` from each batch item and calls `master.addComponentProperty(name, type, defaultValue)` AFTER `figma.combineAsVariants()`. State names containing `=` (e.g. `"Variant=primary, Size=md, State=hover"`) are passed through verbatim so combineAsVariants infers multi-axis properties; legacy single-axis names get a `State=` prefix.

**Master batch payload shape** (produced by `pipeline/figma-masters-batch.mjs#buildMastersBatch`):

```json
{
  "type": "draw-component",
  "batch": [
    {
      "component": "HdsButton",
      "figmaPropertyNames": { "variant": "Variant", "size": "Size", "state": "State" },
      "componentProperties": [
        {
          "name": "Label",
          "type": "TEXT",
          "defaultValue": "Button",
          "sourceProp": "label",
          "boundTo": "characters",
          "targetSelector": "Label"
        },
        {
          "name": "Leading icon",
          "type": "BOOLEAN",
          "defaultValue": false,
          "sourceProp": "iconLeft",
          "boundTo": "visibility",
          "targetSelector": "IconLeft"
        }
      ],
      "states": [
        {
          "state": "Variant=primary, Size=md, State=default",
          "tuple": { "variant": "primary", "size": "md", "state": "default" },
          "tree": { "type": "FRAME", "...": "..." }
        }
      ]
    }
  ]
}
```

Tree nodes that need to be targeted by component-property references MUST set `name` matching `componentProperties[].targetSelector`. BOOLEAN visibility props default to `node.visible = data.visible` if the tree carries it (e.g. `IconLeft` placeholders are emitted with `visible: false` so they hide by default).

## 3. SSE Event Types

The plugin's `EventSource('/stream')` listener (in `figma-agent-plugin/ui.html`) handles every event below. Adding a new event type without updating the plugin is a silent failure.

| Event            | When                                           | Payload shape                                                                                                                            |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`          | On client connect                              | `{ status: 'connected', sequence }`                                                                                                      |
| `node`           | After `/generate` parses a valid JSONL command | `{ sequence, receivedAt, command }` where `command` matches §5                                                                           |
| `plugin-message` | After any `POST /plugin-message`               | `{ sequence, receivedAt, message }` — message is forwarded verbatim into the plugin via `parent.postMessage({ pluginMessage: message })` |
| `heartbeat`      | Every 15 s per connected client                | `{ at: ISO-8601 }`                                                                                                                       |

Sequence numbers are monotonic per bridge process and reset on restart. Consumers MUST tolerate gaps (e.g. across reconnects) and MUST NOT use sequence as a primary key.

## 4. Selection Tree Shape

`extractNodeTree(node)` in `code.js` produces a depth-bounded view of the canvas. The shape below is the contract that fix-mode prompts and the future read-path lint endpoint rely on.

```ts
type SelectionNode = {
  id: string; // Figma node ID
  name: string;
  type: 'FRAME' | 'TEXT' | 'INSTANCE' | 'COMPONENT' | 'GROUP' | string;
  width: number;
  height: number;
  x: number;
  y: number;
  fills?: ReadonlyArray<Paint>; // Figma Paint[]; serialize, do not embed live refs
  boundVariables?: Record<string, VariableAlias>;
  children?: SelectionNode[]; // capped at depth 4
};

type SelectionPayload = {
  tree: SelectionNode[];
  timestamp: number; // Date.now() at capture
};
```

Recursion MUST stop at depth 4 to keep payload size predictable. If a deeper view is needed, add a parameterized endpoint (`/selection?depth=N`) rather than uncapping the default.

## 5. JSONL Command Schema

Every line accepted by `/generate` must be a single JSON object. The bridge currently accepts two `action` values; the JSX compiler in `scripts/hds-jsx-compiler.mjs` and the plugin handlers in `code.js` are the canonical interpreters.

### `ADD_NODE`

```ts
type AddNodeCommand = {
  action: 'ADD_NODE';
  type: 'FRAME' | 'TEXT' | 'INSTANCE' | 'ICON';
  id: string; // unique per generation
  parent?: string; // defaults to 'root' (current page)
  props: Record<string, unknown>; // see token rules below
};
```

### `UPDATE_NODE`

```ts
type UpdateNodeCommand = {
  action: 'UPDATE_NODE';
  id: string; // resolved via figma.getNodeById
  props: Record<string, unknown>;
};
```

### Prop rules (NON-NEGOTIABLE)

- Color and dimension props MUST be token paths or the `var:` shorthand. Examples: `fill: 'semantic.color.surface.raised'`, `padding: 'semantic.space.component.padding'`, `fill: 'var:color.surface.raised'`.
- Raw hex (`#FFFFFF`), `rgb()`, and pixel strings (`'16px'`) are FORBIDDEN in `props`. The AST Gatekeeper (Phase 2 of the orchestration roadmap) will reject these before they reach the bridge; until then the JSX compiler's `resolveVar`/`resolveDim` softens but does not block.
- Numeric primitives are allowed for `width`, `height`, `x`, `y` only — anything that maps to a token MUST use the token path.
- `INSTANCE` commands MUST set `componentName` to a value present in `manifest.componentInventory`. The plugin's `registryLookup` falls back to a placeholder frame if not found, but this is a soft failure; the gatekeeper will hard-fail it.
- `ICON` commands use `name: '<set>:<icon>'` (e.g. `ph:gear-bold`). Iconify is the only allowed remote dependency.

### Validity gate

`isValidCommand(parsed)` in `scripts/generate-to-figma.mjs` is the current pre-broadcast filter. It MUST be the only place the schema is checked CLI-side; the gatekeeper supersedes it once Phase 2 lands.

## 6. Plugin ↔ Bridge URLs

Every URL the plugin uses is currently hardcoded to `http://localhost:3005`. Audit before changing:

| File                         | URL                             | Purpose                                                                              |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `figma-agent-plugin/code.js` | `/plugin-source/sync-tokens.js` | Lazy-load token-sync engine                                                          |
| `figma-agent-plugin/code.js` | `/get-manifest`                 | Manifest hydration for variable binding                                              |
| `figma-agent-plugin/ui.html` | `/stream`                       | SSE listener                                                                         |
| `figma-agent-plugin/ui.html` | `/sync`                         | AI documentation trigger (legacy; route may not exist on bridge — verify before use) |
| `figma-agent-plugin/ui.html` | `/update-manifest`              | Push extracted tokens                                                                |
| `figma-agent-plugin/ui.html` | `/selection`                    | POST selection on `selectionchange`                                                  |

`figma-agent-plugin/manifest.json` declares `networkAccess.allowedDomains: ['http://localhost:3005']`. Any new outbound host MUST be added there or the plugin will silently drop the request at runtime.

## 7. Authentication & Message Integrity (Roadmap)

Currently NONE. Anything on localhost can puppet the canvas. The Phase 5 hardening plan below is binding once implemented; new endpoints SHOULD be authored against it from day one rather than retrofitted.

### Shared secret

- Bridge reads `HDS_BRIDGE_SECRET` from env (refuses to start if unset in production mode).
- Plugin reads the same secret from `figma.clientStorage` after a one-time pairing flow (the bridge prints a setup token on first run; user pastes into plugin UI).

### Envelope

Every plugin↔bridge message MUST be wrapped:

```ts
type Envelope<T> = {
  id: string; // UUID v4; correlates request and response
  type: string; // verb, e.g. 'selection.update', 'generate.command'
  payload: T;
  timestamp: number; // ms since epoch; reject if skew > 60s
  hmac: string; // HMAC-SHA256(secret, `${id}.${type}.${timestamp}.${stableStringify(payload)}`)
};
```

`stableStringify` MUST sort object keys to make the HMAC deterministic across JSON serializers.

### Reject rules

- HMAC mismatch → 401, log, do not include details in response.
- Timestamp skew > 60 s → 401.
- Duplicate `id` within 5 minutes → 409 (replay protection).
- Unknown `type` → 400.

### Response correlation

Bridge tracks pending request IDs in memory with a 30 s timeout. Plugin replies MUST echo the original `id`. The retry loop in `pipeline/retry-loop.mjs` (Phase 3 of the orchestration plan) consumes runtime errors from this channel as if they were validator errors.

## 8. Forbidden Patterns

These rules apply to bridge code, plugin code, and any new generative pipeline stage. Treat them as build-breaking.

- **NEVER hardcode `http://localhost:3005`** in new code. Use `process.env.HDS_BRIDGE_URL` (CLI/Node) or read from `clientStorage` (plugin). The existing hardcoded references are tech debt tracked in the orchestration roadmap.
- **NEVER add an endpoint without a sequence number** in its broadcast payload. Consumers rely on monotonic ordering for diagnostics.
- **NEVER accept a JSONL command whose `action` is not in §5.** Add new actions to the schema first, then to `isValidCommand`, then to the plugin handler — in that order, in separate commits.
- **NEVER bypass the AST Gatekeeper** once Phase 2 lands. Any pipeline stage that wants to short-circuit validation MUST add a flag to `bridge.config.json` and document the bypass in `AI_DECISION_LEDGER.md`.
- **NEVER serialize live Figma node references** into selection payloads or component payloads. Extract primitive values only — `fills`, `boundVariables`, geometry. The plugin sandbox cannot rehydrate live refs across the bridge anyway.
- **NEVER recurse `extractNodeTree` past depth 4** without an explicit caller-supplied depth and a payload-size assertion.
- **NEVER write to `public/hds-manifest.json` outside `/update-manifest`** from the bridge process. The CLI uses `scripts/generate-manifest.mjs`; everything else goes through the endpoint so the `upserted/inserted` accounting stays accurate.
- **NEVER add a remote (non-localhost) outbound call** without updating `figma-agent-plugin/manifest.json#networkAccess.allowedDomains` and `docs/ai/rules/FIGMA_BRIDGE.md` (this file) in the same commit.
- **NEVER use `console.log` for command-flow telemetry**. Append to `telemetry/events.jsonl` via the Phase 0 logger so retry-rate and validator-failure analytics work. `console.log` is fine for boot banners and operator-facing diagnostics.
- **NEVER mutate `currentSelection`, `pendingComponentPayload`, or `clients` from outside the bridge module.** These are process-local state. New consumers go through endpoints.

## 9. Operational Commands

```bash
# Start the bridge (port 3005)
node scripts/hds-bridge.mjs

# Start the LLM stream bridge
node scripts/llm-stream-bridge.mjs

# Generate UI from a prompt
pnpm ui:gen "Login form with email, password, and submit button"

# Fix mode — modify the current Figma selection
pnpm ui:fix "Make this dark mode and increase the heading size"

# Smoke test the JSONL → ADD_NODE pipeline (bypasses LLM)
pnpm test:phase1
```

## 10. Health Checks (Pre-Edit Checklist)

Before opening a PR that touches the bridge or plugin, confirm:

1. `pnpm test:phase1` — JSONL pipeline still green.
2. `pnpm ui:gen "settings card"` — end-to-end LLM generation produces a valid frame in Figma.
3. `pnpm ui:fix "make it red"` against a selected node — UPDATE_NODE flow works.
4. SSE reconnects within 5 s after a bridge restart (the plugin's `onerror` handler retries automatically — verify in the plugin status box).
5. `figma-agent-plugin/manifest.json#networkAccess.allowedDomains` matches the URLs you actually hit.

If any of the above fails and the failure is not the change under test, STOP and append a Root Cause / Resolution entry to `docs/logs/AI_DECISION_LEDGER.md` per the AGENT EXECUTION PROTOCOL in `CLAUDE.md`.

## 11. Smoke Test

`pnpm figma:bridge:smoke` (alias for `node scripts/figma-bridge-smoke.mjs`)
spins up its own bridge on port 3105 (separate from the dev port 3005) and
asserts the JSONL ADD_NODE pipeline + SSE handshake without requiring a
live Figma desktop client.

**Mock mode (default).** With no `FIGMA_TOKEN` in the environment, the
script:

- boots `scripts/hds-bridge.mjs` against port 3105
- pulls `/get-manifest` and asserts ≥ 1 inventoried component
- POSTs two synthetic `ADD_NODE` JSONL lines to `/generate`, asserts
  `accepted=2 rejected=0`
- opens `/stream`, reads the first SSE event (`ready` or `heartbeat`),
  disconnects
- exits 0 on success

**Live mode.** When `FIGMA_TOKEN` is set, the script additionally:

- pings Ollama on `localhost:11434` and confirms `hermes3:latest` (or
  the configured model) is loaded
- still does NOT make a Figma REST API call by itself — it only confirms
  the LLM round-trip is reachable. End-to-end Figma writes still require
  manual `pnpm ui:gen` driven from the plugin.

Wire this into pre-PR / pre-merge checks for any change that touches
`scripts/hds-bridge.mjs`, `figma-agent-plugin/`, or the JSONL command
schema. Failure of the smoke test indicates a bridge contract regression.
