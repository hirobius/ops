---
id: ADR-0004
title: Serverless handler wrappers (withOpsHandler / withServiceClient)
status: accepted
date: 2026-06-26
supersedes: []
superseded-by: []
---

# Serverless handler wrappers (withOpsHandler / withServiceClient)

**Date:** 2026-06-26
**Source:** improve-codebase-architecture review (candidate #1) + grilling loop
**Status:** implemented — `lib/api/handler.ts`, all 8 guarded `api/` routes converted, tests at the new seam

---

## Context

The 8 guarded serverless functions under `api/` (`leads`, `tasks`, `task-action`,
`pull-leads`, `generate-site`, `build-site`, `publish-site`, `route`) each re-owned
the same prologue before any domain logic:

- `requireOpsAuth(req)` → `401 UNAUTHENTICATED` — copy-pasted in 7 files,
- a method guard → `405` — in all 8,
- `try { sb = await getServiceClient() } catch { 503 ENV_MISSING_SUPABASE }` — in 6,
- a private `messageOf` helper — independently defined in 6 files,
- `clampLimit` — defined twice with different signatures for the same invariant.

The interface of "add an `api/` route" was therefore proportional to boilerplate,
not to domain logic — a **shallow** layer. Worse, each handler's real logic was
fused behind the HTTP entrypoint: it could only be exercised by constructing a
`VercelRequest`/`VercelResponse`, a valid signed cookie, and the right env vars.
The handlers were untested (the suite is otherwise design-system / visual specs).

Two facts in the existing code shaped the interface:

- `task-action.ts` already delegated to `applyTaskAction(sb, …)`, which **returns
  `{ status, body }`** — the target seam shape already existed in the codebase.
- `route.ts` is an outlier: it needs auth + method but **no Supabase client** (it
  proxies to a Hetzner assigner with its own `BRIDGE_URL`/`BRIDGE_SECRET` 503
  guards), so client acquisition cannot be hardwired into a single wrapper.

(The auth endpoints `ops-login` / `ops-me` / `ops-logout` are out of scope — they
must stay reachable unauthenticated.)

## Decision

Introduce two **composable** wrappers in `lib/api/handler.ts`, in the deep-module
sense — a small interface over the repeated control flow:

- **`withOpsHandler(method, fn)`** owns auth (`401`), the method guard (`405`), a
  top-level `try/catch` → uniform `500` backstop, and the single
  `res.status().json()` call. `fn` is `(req) => { status, body }`.
- **`withServiceClient(fn)`** owns `getServiceClient` → `503 ENV_MISSING_SUPABASE`
  and injects `sb`. It returns an `OpsHandler`, so it composes *inside*
  `withOpsHandler` for the 7 routes that need a client; `route.ts` simply omits it.

Each handler's inner function is a **named export** returning `{ status, body }`, so
its logic is testable with a stub `sb` and a plain request object — no cookie, env,
or `res`. `messageOf` is centralised in the wrapper.

```ts
export async function leadsHandler(sb, req) { /* … */ return { status: 200, body }; }
export default withOpsHandler('GET', withServiceClient(leadsHandler));
```

Dependency categories (per `codebase-design/DEEPENING.md`): the wrapper is
**in-process**; auth and Supabase are **local-substitutable** (env + `signSession`
for auth; a stub object for `sb`), so there is **no port** at the external
interface — one adapter would be a hypothetical seam.

## Consequences

**Positive**
- Handler logic is testable through its interface — `tests/api/ops-handler.test.ts`
  covers the wrappers (401/405/500/503/inject/pass-through) and `leadsHandler` with
  a stub `sb`, with zero HTTP plumbing.
- The auth/method/client/`messageOf` boilerplate concentrates in one deep module;
  adding a route now costs domain logic, not prologue.
- Uniform `500 { error }` envelope across every route.

**Trade-offs / behaviour change**
- `leads`/`tasks` previously let an *unexpected throw* fall through to Vercel's
  default 500; they now return a clean JSON `500 { error }` via the backstop.
  Intentional and strictly better for the SPA; everything else is byte-identical.
- Handlers that need cleanup-on-error (the `generate-site`/`build-site`/
  `publish-site` lead-status rollback) keep their own inner `try/catch` and return
  `{ status: 500, … }` explicitly; the wrapper catch is only the backstop.
- `api/` and `lib/` are **not** in `tsconfig.typecheck.json` (`src/**` only), so the
  wrappers are validated by a scoped `tsc` over the touched files plus the vitest
  run, not by `pnpm typecheck`. Widening the typecheck scope is deferred.

**Convention:** every new guarded `api/` route uses `withOpsHandler` (composing
`withServiceClient` when it needs Supabase) and returns `{ status, body }` from a
named inner function.

## Alternatives Considered

| Option | Why rejected |
|---|---|
| One wrapper with a `{ client: true }` flag | The inner fn's first arg becomes conditionally-present (`sb` or not) — awkward to type — and options-bags accrete flags. Composition keeps each wrapper single-purpose with clean types. |
| Inner fn takes `(req, res)` and calls `res` itself | `res` still leaks into every handler, so tests still need a `res` mock — a shallower win. The `{ status, body }` return makes the return value the test surface. |
| Leave `getServiceClient` in each handler | The `503` `try/catch` stays duplicated across 6 files — leaves the single most-repeated piece of boilerplate in place. |

## References

- `lib/api/handler.ts`, `tests/api/ops-handler.test.ts`
- improve-codebase-architecture review, 2026-06-26 (`docs/ai/ds-handoff.md` sibling artifact / scratch report)
- `skills/engineering/codebase-design/DEEPENING.md` (dependency categories, seam discipline)
- `lib/ops-auth.mjs`, `lib/supabase/server.mjs`
