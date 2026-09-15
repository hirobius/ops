# PARKED — things deliberately not in the work queue

> **Why this file exists.** An issue tracker should hold work with a _current
> reason to act_. Anything whose reason lies in the future is a reminder, not a
> task — and left as an open issue it costs triage attention on every pass while
> never being actionable. On 2026-09-15 eleven such issues were closed; their
> substance lives here.
>
> **Nothing here is lost.** Every entry names the closed issue that holds the
> full detail, and a **trigger** — the concrete condition that puts it back in
> the queue. `scripts/check-parked-triggers.mjs` evaluates the machine-checkable
> triggers and tells you which have fired.

## How re-entry works

Each entry carries a `trigger:` of one of four kinds:

| Kind    | Format                                                         | Evaluated by              |
| ------- | -------------------------------------------------------------- | ------------------------- |
| `date`  | `date: 2026-12-01`                                             | the script, automatically |
| `path`  | `path: apps/concrete` (fires when the path appears/disappears) | the script, automatically |
| `issue` | `issue: ops#78 closed`                                         | the script, automatically |
| `event` | `event: <plain-English condition>`                             | a human, at review        |

Run `pnpm parked:check` (or `node scripts/check-parked-triggers.mjs`). It exits
non-zero and names any entry whose trigger has fired. `event:` triggers can't be
evaluated automatically, so they surface on the **quarterly review** line below —
that review is the backstop that stops this file becoming a graveyard.

**Next quarterly review: 2026-12-15.**

When a trigger fires: **file a fresh issue** citing the parked entry and the
original closed issue, then delete the entry here. Don't reopen the old issue —
its premise is months stale by definition, and today's sweep found stale
premises in six of the issues examined.

---

## Compliance / legal

### Vanta — SOC 2 / continuous compliance monitoring

- **origin:** ops#49 (closed 2026-09-15) — full runbook, cost model, framework comparison
- **trigger:** `event: a named prospect makes a security attestation a condition of signing`
- **why parked:** paid subscription + separate auditor fee + a 3–6 month observation window, committed before any client has asked. The issue's own scope note said not to pull it ahead of first revenue.
- **sequencing note:** do the GitHub org promotion (#48) first — Vanta's GitHub integration monitors org-level controls and is much cleaner against a real org.

---

## Product / tooling

### Digest → Issue promotion pipeline (P2 analyze, P3 sources, P4 Gmail pull)

- **origin:** ops#77 (epic), #79, #80, #81 — all closed 2026-09-15. P1 (#78) **shipped and stays shipped**.
- **trigger:** `event: the manual "scrub my newsletters" pass becomes a proven, recurring bottleneck`
- **why parked:** builds a machine that files _more_ issues, when the measured constraint is decision throughput, not intake. P2 also carries per-analyze LLM spend; P4 needs server-side Gmail OAuth.
- **what already works:** `digest_items` store, `api/digest.ts` + `api/digest-action.ts`, dismiss/restore with a collapsible stash on `DigestPage`.
- **design preserved in #77:** the two-step Analyze→Approve recommendation (vs draft-immediately), and the reused seams (`lib/agent/llm.mjs`, `lib/github/issues.mjs::createIssue`, the 12-Vercel-function ceiling).

### Dashboard command-center / skill-bar backlog (19 items)

- **origin:** ops#62 (closed 2026-09-15); ops#227 remains open as the single surviving dashboard epic
- **trigger:** `event: one specific skill-bar item removes a proven, recurring bottleneck`
- **why parked:** 19 checkboxes, no DoD, structurally un-closeable. Net-new dashboard tooling — the exact expansion the feature freeze exists to hold.
- **re-entry rule:** file the _one_ item, with a real DoD. Never revive the umbrella.

---

## Cross-repo

### Extract the Concrete Creations multi-tenant subsystem

- **origin:** ops#19 (closed 2026-09-15) — holds the 48-file manifest and the exact extraction recipe
- **trigger:** `path: apps/concrete` — fires if it ever reappears in ops (it should not)
- **also:** `event: you decide to stand up the concrete-creations repo`
- **why parked:** `apps/concrete/` was already stripped from ops in `b8abe96`. There is no ops-side change left to make; the remaining work belongs to a repo that doesn't exist yet.
- **gotchas for the new repo:** resolve the base token graph from the published `@hirobius/design-system`, not a local copy; `hirobius.tenant-metadata.schema.json` is dangling — author it or drop the `$schema` line; the brand hexes are placeholders.

---

## Decided — do not revive

### Local Ralph runner

- **origin:** ops#214 (closed 2026-09-15)
- **trigger:** `event: a real constraint appears — rate limits, a private repo, or wanting to drive the loop offline`
- **why parked:** the premise was false (both repos are public, so Actions are free) and acting on it **caused a two-month hds outage** — the watchdog was relocated to this runner, which was then never built. The 6h cron backstop (ops#232, hds#201) is the correct mechanism.
- **if revived:** it must be _additive_ to the cron, never a replacement.

### Legacy `check:full` / `check:release` retirement

- **origin:** ops#240 (closed 2026-09-15)
- **trigger:** `event: check:full starts failing for reasons other than a real defect`
- **why parked:** premise inverted. #175 and #245 fixed the crashes; it now runs green as a 17-gate local pre-flight that catches real issues. Deleting it would be tidiness at the cost of coverage.

### "Frontier engineering" discussion

- **origin:** ops#274 (closed 2026-09-15)
- **trigger:** `event: further reading produces a specific structural change worth making`
- **why parked:** a thinking prompt with no deliverable. It already paid out as #292, #293, #298, #302 and #303 — file the change, not the discussion.
