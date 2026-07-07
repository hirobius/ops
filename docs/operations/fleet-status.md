# Fleet status — live `status.json` aggregation (`GET /api/projects`)

The ops dashboard reflects each fleet repo's status the moment it lands on that
repo's **default branch** — no ops redeploy. A serverless function reads every
repo's root `status.json` **live from the GitHub Contents API** on each request
(edge-cached ~60s), so pushing an updated `status.json` to `main` shows up on the
next dashboard load.

## Pieces

| File | Role |
|---|---|
| `lib/fleet-status.mjs` | Pure core — `fetchFleetStatus()` fetches + normalizes each repo's `status.json`. Injectable `fetchImpl`/`now` → unit-tested offline. |
| `api/projects.ts` | Vercel serverless `GET /api/projects` — thin wrapper; env guard; edge cache headers. |
| `vite.config.mjs` (`ops-projects-api`) | Dev parity so `/api/projects` works under `pnpm dev`. |
| `scripts/__tests__/fleet-status.test.mjs` | `node --test` — parse / 404 / bad-JSON / ref / mixed-batch. |

## `status.json` contract

Each fleet repo keeps a root `status.json` (see the convention in
`clients/CLAUDE.md`):

```json
{
  "updatedAt": "2026-07-06T00:00:00Z",
  "phase": "active",
  "headline": "one honest paragraph on where the project stands",
  "next": ["top next action (#12)"],
  "blocked": ["what's stuck + why (#8)"]
}
```

Missing/garbage fields are tolerated (empty arrays, `null` phase). An unrecognized
`phase` is passed through but flagged `phaseKnown: false`.

## Environment (human-set in Vercel — never in `.env`)

- **`GITHUB_TOKEN`** — a PAT (fine-grained or classic) with **`Contents: read`** on
  the fleet repos (private repos require it). Unset → `503 ENV_MISSING_GITHUB_TOKEN`.

## Adding / previewing repos

- **Add a repo:** append a row to `FLEET_REPOS` in `lib/fleet-status.mjs`
  (`{ owner, repo, label }`).
- **Preview a branch:** `GET /api/projects?ref=<branch>` reads that ref's
  `status.json` for every repo (default: each repo's own default branch).

## Response

```
200 { generatedAt, projects: [{ owner, repo, label, ref, htmlUrl,
      ok, status?: { updatedAt, phase, headline, next[], blocked[] }, error? }] }
```

Per-repo failures never fail the whole call — each project row carries its own
`ok` + `error` (e.g. `"no status.json on this ref yet"`).

## Notes

- Adds **one** serverless function (watch the Hobby 12-function cap — see #18).
- **Sandbox caveat:** in the Claude cloud container, Node `fetch` reaches GitHub
  only via the agent proxy (`NODE_USE_ENV_PROXY=1`), and that proxy gates raw REST,
  so a live `ok:true` can't be produced here — parsing is covered by the unit test
  instead. On Vercel (real PAT, no proxy) the happy path is a normal REST read.
- **Rendering the data on `/ops` is the remaining half** and is tracked separately
  (blocked on the DS 0.11 reconciliation — the ops app doesn't typecheck against
  `@hirobius/design-system@0.11` on this branch yet).
