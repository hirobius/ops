# Figma Plugin — Operator Runbook

Plain-English steps to get the HDS Agent Bridge plugin running and unstuck. For deep architecture, see `docs/ai/rules/FIGMA_BRIDGE.md`.

## What's where

| Piece | Lives at | Started by |
|---|---|---|
| Bridge (Express + SSE) | `scripts/hds-bridge.mjs` → `localhost:3005` | `node scripts/hds-bridge.mjs` |
| Plugin (sandbox UI) | `figma-agent-plugin/` | Loaded in Figma Desktop via `manifest.json` |
| LLM (local) | Ollama, `localhost:11434`, model `hermes3` | `ollama serve` (usually already running) |
| Generator CLI | `scripts/generate-to-figma.mjs` | `pnpm ui:gen` / `pnpm ui:fix` |

The plugin only talks to the bridge. The bridge talks to disk + the generator. Auth between plugin ↔ bridge is HMAC over a shared secret.

## First-time setup

1. **Generate a shared secret:**
   ```bash
   openssl rand -hex 32
   ```
2. **Add it to `.env.local`** (manual — never commit):
   ```
   HDS_BRIDGE_SECRET=<the hex value>
   ```
3. **Load the plugin in Figma Desktop** (one time):
   - Menu → Plugins → Development → Import plugin from manifest…
   - Pick `figma-agent-plugin/manifest.json`
4. Confirm Ollama is up:
   ```bash
   curl -s localhost:11434/api/tags | head
   ```

## Daily startup (the only sequence you actually need)

Two terminals. Then Figma.

**Terminal A — bridge:**
```bash
pnpm bridge
```
Wraps `node --env-file=.env.local scripts/hds-bridge.mjs` so `HDS_BRIDGE_SECRET` is loaded automatically. Look for `🌉 HDS Bridge live at http://localhost:3005`. Keep it running.

**Terminal B — generator (only when generating):**
```bash
pnpm ui:gen     # fresh component from prompt
pnpm ui:fix     # iterate on currently-selected Figma node
```

**Figma:** open a file, run the **HDS Agent Bridge** plugin (Plugins → Development → HDS Agent Bridge). On first run an inline **Set Bridge Secret** form appears at the bottom of the Main tab — paste the value of `HDS_BRIDGE_SECRET` and click Save. The plugin caches it in clientStorage; you can re-open the form any time via the "Set Bridge Secret" button (e.g. when the secret rotates).

## Stopping

- Bridge: Ctrl-C in Terminal A.
- Plugin: close it in Figma. State is in clientStorage and survives restarts.
- Generator: nothing to stop — it's a one-shot CLI per invocation.

## Troubleshooting

### `ERR_CONNECTION_REFUSED` on `/stream`
The bridge isn't running, or crashed. Start (or restart) it in Terminal A. The plugin's "Ready for action…" log message is printed locally on UI load — it doesn't mean the bridge connected.

### `FATAL: HDS_BRIDGE_SECRET environment variable is unset` at bridge start
`bridge.config.json` has `authEnabled: true` (correct, do not flip this off). Either:
- Make sure your shell loads `.env.local`, **or**
- Run `export HDS_BRIDGE_SECRET=<value>` in the terminal first.

### `⚠ Bridge secret entry cancelled — no change`
You hit Cancel (or left the input empty) on the inline secret form. Click **Set Bridge Secret** again at the bottom of the Main tab and paste the value. Saving overwrites any prior cached secret.

### Plugin connects but every action returns `401 Unauthorized`
The secret in the plugin doesn't match the bridge's env var. Clear the plugin's stored secret (above) and paste the correct one. They must match exactly.

### `pnpm ui:gen` hangs forever
Ollama isn't responding. Check `curl localhost:11434/api/tags`. If it's down, `ollama serve` (or restart the Ollama app). Confirm `hermes3` is pulled: `ollama list`.

### "Bridge offline — retrying…" in plugin UI but bridge is running
Likely the secret mismatch above, or a stale plugin reload. Hard-reload the plugin (right-click in Figma → Plugins → Development → Hot reload).

## Useful endpoints (curl from another terminal while bridge is up)

```bash
curl localhost:3005/get-manifest | jq '.tokens | keys'   # confirm bridge can read manifest
curl localhost:3005/stream                                # SSE stream (Ctrl-C to exit)
curl localhost:3005/selection                             # last selection pushed by plugin
```

## Hard rules (do not violate)

- **Never** flip `authEnabled` off in `bridge.config.json` to "fix" auth issues. Fix the secret instead.
- **Never** commit `.env.local` or paste the secret into source/docs/screenshots.
- **Never** edit `figma-agent-plugin/code.js` or `ui.html` without reading `docs/ai/rules/FIGMA_BRIDGE.md` first — sandbox constraints are non-obvious.
