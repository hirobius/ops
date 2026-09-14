# Leads → site — requirements

Status: active
Last verified: 2026-09-14
Issues: #185 (p0) · #186 (p1) · #187 (p1) · #190 (p1, blocked) · #188 · #191 · #196

## Outcome

A sourced lead can be taken from the /ops Leads board to a real, deployable
client site without anyone reconstructing the hand-off by hand. Today the board's
only site button dispatches a **retired Duda path that fabricates fake preview
URLs**; the working `render` action exists, is tested, and **no UI ever calls
it**. When this epic ships, "Generate → Render → paste → deploy" is the whole
motion, and the generated site reflects the lead's real hours, address, photos and
logo rather than hardcoded stubs.

## Why it matters (north-star test)

**Yes — this *is* the north star.** `NORTH_STAR.md`: "lead → generated site →
publish → outreach → invoice." This epic is the `lead → generated site` leg. It
is the single highest-value work in the repo and was the 2026-09-14 finding that
drove `docs/ai/FRONTIER-DOCTRINE.md`: #185 has been `p0` and unqueued since
2026-07-12.

## User-visible behaviour

- The Leads board's site button dispatches `render`, not `build`.
- The response's `configFile` (drop-in `client.config.ts` source) and `commands`
  (scaffold → preview → prod block) appear as **copy-to-clipboard blocks** —
  paste-ready, per the Working-with-Adrian conventions in `CLAUDE.md`.
- A `rendered` lead shows its own badge tone and, once `preview_url` is recorded,
  a preview link; re-render stays available.
- No UI path dispatches `build` or `publish` (the Duda stubs) anymore.
- Generated configs carry the lead's **real** opening hours and street address
  when the lead row has them — and carry nothing at all when it doesn't.

## Acceptance criteria

- [ ] Clicking the board's site button POSTs `{ leadId, action: 'render' }` and
      renders `configFile` + `commands` as copyable blocks (#185)
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

## Out of scope

- Automating the deploy. `lib/render` deliberately *emits* commands for a human
  to run; executing them is a later, separate decision (`lib/render/index.mjs`
  header: "automating later means executing `commands` instead of displaying them").
- Any other dashboard visual tooling. #185 says it explicitly: surface the render
  hand-off, build nothing else.
- Server changes in #185 — `api/lead-action.ts` and `lib/leads/pipeline.mjs` are
  out of scope for that slice.

## Constraints that hold throughout

- **Fabrication ban.** Absent fields stay absent. No invented hours, addresses,
  photos, or reviews. This is a §5-essential gate in the doctrine — not
  negotiable with better agent context.
- **Zod `defineClient` contract** (vendored `lib/schema`) validates every config;
  `renderArtifacts` re-validates at the hand-off so drift fails loudly there
  rather than in the clients build.
- **`publicPath`**: photo paths must be local files under the app's `public/` dir.
- **Money gate**: Outscraper details-API spend needs Adrian's explicit go (#190).
- Supervised merges — this path touches client-facing output, so slices are
  `ralph-ready` but **not** `ralph-auto`.
