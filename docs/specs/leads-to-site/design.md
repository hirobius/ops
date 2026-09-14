# Leads → site — design

Status: active
Last verified: 2026-09-14

## Current state

The server side is **built, tested, and unreachable from the UI**.

| Seam | File | State |
|---|---|---|
| Action dispatcher | `api/lead-action.ts:38` | `ACTIONS = ['generate','build','publish','render']` — all four live |
| Render transition | `lib/leads/pipeline.mjs:83` `renderLeadSite` | Works. Returns `{ ok, rendered, slug, preset, configFile, commands }`; `409 NO_CONFIG` before generate; `422 CONFIG_INVALID` on drift |
| Artifact builder | `lib/render/index.mjs` `renderArtifacts` | Re-validates through `defineClient`, emits `client.config.ts` source + deploy command block |
| Generation | `lib/leads/pipeline.mjs:26` `generateLeadSite` → `lib/agent/index.mjs` `runPipeline` | enrich → generate → judge, writes `status='scored'` |
| Board UI | `src/app/pages/ops/leads/LeadsPage.tsx:147` | Dispatches **`'build'`** → retired Duda stub → fabricated preview URLs |
| Board UI | `LeadsPage.tsx:94` | Dispatch response is **discarded** |
| Types | `src/app/pages/ops/leads/types.ts:6` | `LeadStatus` does not model `'rendered'`, which the server already writes |

Two concrete defects fall out of that table:

1. **A dead path is the only path.** The button users press terminates in Duda and
   fabricates preview URLs — a fabrication-ban violation shipped in the UI.
2. **A live type gap.** The server writes `status:'rendered'`; the client union
   doesn't have it, so the badge falls through to `?? 'neutral'`.

Separately, `generateLeadSite` (`lib/leads/pipeline.mjs:36-47`) forwards only
name/category/city/region/phone/email/website/rating/reviewCount/notes into
`runPipeline`. It **drops `hours`, `street_address`, `photos`, `logo_url`** even
though `getLead` already returned them — so `assemble()` (`lib/agent/generate.mjs:30-65`)
ships hardcoded hours and a generic `map.embedQuery` on **every** site.

## Target shape

```
lead row ──► generateLeadSite ──► runPipeline (enrich→generate→judge) ──► config, status='scored'
   │              ▲
   │              └── #186: also forward hours, street_address, photos[], logo_url
   ▼
LeadsPage "Render site"
   └─► POST /api/lead-action { leadId, action:'render' }
         └─► renderLeadSite ─► renderArtifacts ─► { configFile, commands }
               └─► UI: two copy-to-clipboard blocks   ◄── #185 (the gap)
                     └─► human pastes into hirobius/clients, deploys
                           └─► POST again with previewUrl ─► status='rendered', preview_url
```

The hand-off stays **semi-manual by design**. `lib/render`'s header names the
future path (a deploy worker executing `commands` instead of displaying them);
that is a separate decision, not this epic.

## Alternatives rejected

| Option | Why rejected |
|---|---|
| Fix the Duda `build` path instead of switching the button to `render` | Duda is retired; the Astro factory is the cutover target. Repairing it would restore a fabrication source and duplicate the render seam. #187 marks it dead instead. |
| Auto-execute the deploy `commands` from the board | Publishing is a **billing event** (`NORTH_STAR.md`). It stays a deliberate human action until billing is wired (#200). Automating it is also out of scope per `lib/render`'s own contract. |
| Emit remote photo URLs into the config | The schema's `publicPath` rejects anything not under the app's `public/` dir — a remote URL produces an invalid config that fails at the clients build. Photos need a download step in the command block (#190), not a schema change. |
| Let the agent fill missing hours/addresses plausibly | Fabrication ban. Absent stays absent; a generic stub is honest, an invented opening time is not. |
| Build richer board tooling around the hand-off (previews, editors, diff views) | #185 scopes this explicitly to copyable blocks. Dashboard tooling is not the north star and has repeatedly absorbed capacity that belongs here. |
| Ship #185 and #186 as one PR | They touch different layers (UI vs. agent/pipeline) with different risk. #185 is UI-only with no server changes; #186 changes generated client output. Separate PRs, separate review posture. |

## Risks

| Risk | What catches it |
|---|---|
| Config drifted since generation | `renderArtifacts` re-validates via `defineClient`; `renderLeadSite` returns `422 CONFIG_INVALID` with readable zod issues |
| A generated config reaches the clients build invalid | Zod `defineClient` gate, plus re-validation at the hand-off |
| `assemble()` change breaks existing agent fixtures | #186 forbids new *required* fields in the forced-tool schemas; existing fixtures must pass unchanged |
| Invented business details reach a client's live site | Fabrication ban + the "absent stays absent" unit test in #186's DoD |
| Outscraper details spend runs without approval | #190 is `blocked` pending Adrian's explicit go — a §5-essential money gate |
| UI regression on the Leads board | `pnpm typecheck` + `pnpm test:layout` (mandatory under the CLAUDE.md UI protocol) |
