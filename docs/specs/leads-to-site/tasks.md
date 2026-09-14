# Leads → site — tasks

Status: active
Last verified: 2026-09-14

Dependency-ordered. Each row is one issue, one PR.

| # | Issue | Slice | Depends on | Queue posture |
|---|---|---|---|---|
| 1 | [#185](https://github.com/hirobius/ops/issues/185) `p0` | Wire the `render` action into LeadsPage; surface `configFile` + `commands` as copy blocks; model `'rendered'` | — | `ralph-ready` (supervised — client-facing output, **no** `ralph-auto`) |
| 2 | [#186](https://github.com/hirobius/ops/issues/186) `p1` | Forward `hours`, `street_address`, `photos[]`, `logo_url` from the lead row into `runPipeline`; use them in `assemble()` | — (independent of #185) | `ralph-ready` (supervised — changes generated client output) |
| 3 | [#187](https://github.com/hirobius/ops/issues/187) `p1` | Mark the Duda path (`lib/duda`, `buildLeadSite`, `publishLeadSite`) dead for removal | #185 (no UI dispatches it first) | `ralph-ready` + `ralph-auto` (pure cleanup) |
| 4 | [#190](https://github.com/hirobius/ops/issues/190) `p1` | Outscraper photo/logo details pass + photo-download block in render commands | #186 | **blocked**: Adrian's go on details-API spend + endpoint choice (money gate) |
| 5 | [#188](https://github.com/hirobius/ops/issues/188) `p2` | Free palette via `brand.cssVarOverrides`; lazy-palette + contrast pre-checks | #186 | backlog — promote after 1–3 land |
| 6 | [#191](https://github.com/hirobius/ops/issues/191) `p2` | Model-chosen hero variant + section order in `assemble()` | #186 | backlog |
| 7 | [#196](https://github.com/hirobius/ops/issues/196) `p2` | Pexels stock-photo fallback for imagery-less hero/gallery slots | #190 | backlog |

## Notes

- **Slices 1 and 2 are independent** — #185 is UI-only (`api/lead-action.ts` and
  `lib/leads/pipeline.mjs` explicitly out of scope), #186 is pipeline/agent-only.
  They can run concurrently on separate branches; single-flight means they run
  back-to-back in practice.
- **Nothing here is `ralph-auto` except #187.** This path touches client-facing
  output, so merges stay supervised per doctrine §5.
- #190's blocker is a **money gate**, one of the essential ones. It is not
  friction to be removed with better agent context.
