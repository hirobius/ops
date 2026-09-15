# Leads → site

Status: active
Last verified: 2026-09-14
Issues: #185 (p0) · #186 (p1) · #187 (p1) · #190 (p1, blocked) · #188 · #191 · #196

## Outcome

A sourced lead can be taken from the /ops Leads board to a real, deployable
client site without anyone reconstructing the hand-off by hand. Today the board's
only site button dispatches a **retired Duda path that fabricates fake preview
URLs**; the working `render` action exists, is tested, and **no UI ever calls
it**. When this ships, "Generate → Render → paste → deploy" is the whole motion,
and the generated site reflects the lead's real hours, address, photos and logo
rather than hardcoded stubs.

**North-star test: yes — this *is* the star.** `NORTH_STAR.md`: "lead → generated
site → publish → outreach → invoice." This is the `lead → generated site` leg. It
was the 2026-09-14 finding that drove `docs/ai/FRONTIER-DOCTRINE.md`: #185 has
been `p0` and unqueued since 2026-07-12.

## Acceptance criteria

- [ ] Clicking the board's site button POSTs `{ leadId, action: 'render' }` and
      renders `configFile` + `commands` as copy-to-clipboard blocks (#185)
- [ ] `'rendered'` is modelled in `LeadStatus`, has a `STATUS_TONE` entry, and is
      counted in the summary filter — the `?? 'neutral'` fallback is never hit (#185)
- [ ] No UI code path dispatches `'build'` or `'publish'` (#185); the Duda module
      is marked dead for removal (#187)
- [ ] A lead with `working_hours` + `street_address` yields a config containing
      them; a lead without them yields today's stubs unchanged (#186)
- [ ] Photos, when present, are referenced only as local `public/` paths — the
      schema's `publicPath` rejects remote URLs (#186, #190)
- [ ] `defineClient` validates every generated config; ops suite, `typecheck`
      and `test:layout` green

**Out of scope.** Automating the deploy (`lib/render` deliberately *emits*
commands for a human — publishing is a billing event). Any other dashboard visual
tooling — #185 says it explicitly. Server changes in #185: `api/lead-action.ts`
and `lib/leads/pipeline.mjs` are out of that slice.

**Constraints that hold throughout.** Fabrication ban — absent fields stay absent,
no invented hours, addresses, photos or reviews (a doctrine §5 essential gate, not
negotiable with better agent context). Zod `defineClient` contract validates every
config, and `renderArtifacts` re-validates at the hand-off so drift fails there
rather than in the clients build. `publicPath` requires local files under the
app's `public/` dir. Outscraper details spend needs Adrian's explicit go (#190).
Merges stay supervised — this path touches client-facing output.

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

Two defects fall out of that table:

1. **A dead path is the only path.** The button users press terminates in Duda and
   fabricates preview URLs — a fabrication-ban violation shipped in the UI.
2. **A live type gap.** The server writes `status:'rendered'`; the client union
   doesn't have it, so the badge falls through to `?? 'neutral'`.

Separately, `generateLeadSite` (`lib/leads/pipeline.mjs:36-47`) forwards only
name/category/city/region/phone/email/website/rating/reviewCount/notes into
`runPipeline`. It **drops `hours`, `street_address`, `photos`, `logo_url`** even
though `getLead` already returned them — so `assemble()`
(`lib/agent/generate.mjs:30-65`) ships hardcoded hours and a generic
`map.embedQuery` on **every** site.

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

**The section this document exists for.** A rejected option recorded here stops
the next session re-proposing it.

| Option | Why rejected |
|---|---|
| Fix the Duda `build` path instead of switching the button to `render` | Duda is retired; the Astro factory is the cutover target. Repairing it would restore a fabrication source and duplicate the render seam. #187 marks it dead instead. |
| Auto-execute the deploy `commands` from the board | Publishing is a **billing event** (`NORTH_STAR.md`). It stays a deliberate human action until billing is wired (#200). Also out of scope per `lib/render`'s own contract. |
| Emit remote photo URLs into the config | The schema's `publicPath` rejects anything not under the app's `public/` dir — a remote URL produces an invalid config that fails at the clients build. Photos need a download step in the command block (#190), not a schema change. |
| Let the agent fill missing hours/addresses plausibly | Fabrication ban. Absent stays absent; a generic stub is honest, an invented opening time is not. |
| Build richer board tooling around the hand-off (previews, editors, diff views) | #185 scopes this to copyable blocks. Dashboard tooling is not the north star and has repeatedly absorbed capacity that belongs here. |
| Ship #185 and #186 as one PR | Different layers, different risk. #185 is UI-only with no server changes; #186 changes generated client output. Separate PRs, separate review posture. |

## Risks

| Risk | What catches it |
|---|---|
| Config drifted since generation | `renderArtifacts` re-validates via `defineClient`; `renderLeadSite` returns `422 CONFIG_INVALID` with readable zod issues |
| A generated config reaches the clients build invalid | Zod `defineClient` gate, plus re-validation at the hand-off |
| `assemble()` change breaks existing agent fixtures | #186 forbids new *required* fields in the forced-tool schemas; existing fixtures must pass unchanged |
| Invented business details reach a client's live site | Fabrication ban + the "absent stays absent" unit test in #186's DoD |
| Outscraper details spend runs without approval | #190 is `blocked` pending Adrian's explicit go — an essential money gate |
| UI regression on the Leads board | `pnpm typecheck` + `pnpm test:layout` (mandatory under the CLAUDE.md UI protocol) |

## Tasks

Dependency-ordered. Each row is one issue, one PR.

| # | Issue | Slice | Depends on | Queue posture |
|---|---|---|---|---|
| 1 | [#185](https://github.com/hirobius/ops/issues/185) `p0` | Wire the `render` action into LeadsPage; surface `configFile` + `commands` as copy blocks; model `'rendered'` | — | `ralph-ready` (supervised — client-facing output, **no** `ralph-auto`) |
| 2 | [#186](https://github.com/hirobius/ops/issues/186) `p1` | Forward `hours`, `street_address`, `photos[]`, `logo_url` into `runPipeline`; use them in `assemble()` | — (independent of #185) | `ralph-ready` (supervised — changes generated client output) |
| 3 | [#187](https://github.com/hirobius/ops/issues/187) `p1` | Mark the Duda path (`lib/duda`, `buildLeadSite`, `publishLeadSite`) dead for removal | #185 (no UI dispatches it first) | `ralph-ready` + `ralph-auto` (pure cleanup) |
| 4 | [#190](https://github.com/hirobius/ops/issues/190) `p1` | Outscraper photo/logo details pass + photo-download block in render commands | #186 | **blocked**: Adrian's go on details-API spend + endpoint choice (money gate) |
| 5 | [#188](https://github.com/hirobius/ops/issues/188) `p2` | Free palette via `brand.cssVarOverrides`; lazy-palette + contrast pre-checks | #186 | backlog — promote after 1–3 land |
| 6 | [#191](https://github.com/hirobius/ops/issues/191) `p2` | Model-chosen hero variant + section order in `assemble()` | #186 | backlog |
| 7 | [#196](https://github.com/hirobius/ops/issues/196) `p2` | Pexels stock-photo fallback for imagery-less hero/gallery slots | #190 | backlog |

**Slices 1 and 2 are independent** — #185 is UI-only, #186 is pipeline/agent-only.
They can run concurrently on separate branches; single-flight means back-to-back
in practice. **Nothing here is `ralph-auto` except #187** — this path touches
client-facing output, so merges stay supervised. #190's blocker is a money gate,
one of the essential ones; it is not friction to be removed with better context.
