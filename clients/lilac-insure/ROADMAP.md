---
client: lilac-insure
audience: Adrian (operator) + future-Adrian + any subagent picking up this engagement
lastUpdated: 2026-05-05
status: living document — update as decisions land and milestones close
---

# Lilac Insure — Roadmap

The agreed scope of work for Lilac Insurance Group (Conrad Milsap, Spokane WA, 600 customers / 1,200 policies, solo operator). First Hirobius automation client. Engagement started 2026-04-28.

This is the durable answer to "what are we building for them?" — committed to the repo, surfaced in `/ops/clients/lilac-insure`, version-controlled. If a fact about scope changes, update this file rather than relying on chat history.

## Operating model

**Hirobius is a software vendor, not a data processor.** Every workflow runs on Conrad's infrastructure (his PC or a VPS he provisions in his name) using his existing service subscriptions (EZLynx, Outlook, WordPress, DocuSign, LightSpeed). We deliver code; he runs it; he remains the data controller. This drops us out of ~80% of the legal scaffolding that would otherwise be required (DPA, sub-processor disclosures, WISP, SOC 2). Light vendor obligations remain (LLC, E&O insurance, SLA template, Anthropic standard DPA).

The architectural consequences:
- Every workflow ships with a `mode: "test"` default and a canonical `testRecipient` (`administration@lilacinsure.com`)
- LLM work runs through an adapter layer: Ollama (default, local, free) → Claude (customer's own API key) → none (deterministic-only). Hirobius is never in the data path.
- All persistence is on Conrad's side. `_log.jsonl` and any analysis output are gitignored on his clone.

---

## Phase 1 — $1,500 sprint

**Status: in progress.** Scaffolding shipped (commits `49537b92` and `43d2b461`). All 5 workflows exist as runnable stubs in test mode. Promotion to live happens per workflow once access lands and Conrad signs off.

### Deliverables (from `retainer.json`)

| # | Deliverable | Code path | Status | Blocked on |
|---|-------------|-----------|--------|------------|
| 1 | Lead intake automation | `automations/lead-intake/` | scaffolded | EZLynx API, WordPress + Gravity access |
| 2 | Outlook triage structure + rules | `automations/email-triage/` (12 categories, classifier 15/15) | scaffolded | Microsoft Graph creds (`2-5`) |
| 3 | Follow-up email/text templates | `automations/auto-responder/` + per-bucket reply templates | stubs ready | Conrad approves copy |
| 4 | Renewal reminder prototype | `automations/renewal-reminder/` | scaffolded | EZLynx + LightSpeed access |
| 5 | Tool & access review | `stack.json` (data) + summary doc (`5-4`) | needs written summary | nothing |
| 6 | E2E testing with fake accounts | — | not started | M365 dev tenant + EZLynx sandbox |
| 7 | Handoff documentation | `INSTALL.md` (Conrad-facing) + `OPERATOR.md` (operator runbook) | not started | nothing |

`automations/cancellation-winback/` is also scaffolded but not named in the retainer text — see Deferred Decisions for phase assignment.

### Definition of Done

Phase 1 closes when **all** of the following are true:

- [ ] All in-scope Phase 1 workflows running in `mode: "production"` against real systems
- [ ] Conrad has signed off per-workflow (the promotion checklist in each workflow's `README.md` is checked)
- [ ] `INSTALL.md` and `OPERATOR.md` delivered and reviewed
- [ ] One end-to-end demo recording shared with Conrad
- [ ] Phase 1 invoice issued; retainer either closed or refilled for Phase 2
- [ ] `clients/lilac-insure/notes.md` updated with engagement-close summary

---

## Phase 2 — pro bono (gratuity for first-client status)

Three gestures, picked 2026-05-05. Not part of the retainer; not invoiced; delivered after Phase 1 is in production. Tracked in `tasks.json` as `phase-2-candidate` until activated.

| Item | Effort | What it produces |
|------|--------|------------------|
| **Inbox discovery report** | ~½ day after M365 access lands | One-shot Pattern A run on Conrad's real inbox. Written analysis: composition by category, top sender domains, lead response-time baseline, lifecycle-stage breakdown. PDF + raw JSON. |
| **Brand audit deck** | ~1 day | The 7 touchpoints from `brand-audit.json` rendered as PDF or Figma deck with 3–5 quick-win recommendations. Pure observation, no rebrand pitch. |
| **Call transcription POC** | 3–5 days | Conrad's "dream feature." Local Whisper + Ollama action-extraction on a single recorded call → structured note. Demo only; productionization is `ai-2` paid. |

---

## Phase 2 — paid (planned, not yet scoped)

Already in `tasks.json` Phase 2 block. Each gets a separate scope-and-quote round before any work starts.

- `ai-1` Local email-triage-bot (LLM upgrade for the ambiguous tail beyond deterministic rules)
- `ai-2` Call transcription + EZLynx auto-note (full productionization of the pro bono POC)
- `ai-3` Commercial renewal ACORD pre-fill (Conrad's biggest renewal time-sink)

---

## Phase 3 — future

- `service-request-widget` — client-facing intake on `lilacinsure.com` (policy change / billing / claims-light) routed to EZLynx
- `agentic-command-center` — Conrad's lightweight ops dashboard, mirroring `/ops` but client-scoped

---

## Architecture decisions — locked in

These are not up for revisiting unless evidence forces a change.

1. **Software-vendor positioning** — code runs on customer hardware; customer is data controller. Light SLA, not heavy DPA. (See `notes.md` and Operating model section above.)
2. **Test-mode default everywhere** — every `run.mjs` starts in `mode: "test"` with all outbound traffic routed to `testRecipient`. Promotion is per-workflow with a written checklist, never global.
3. **Three LLM adapters, Ollama default** — `_shared/llm/{ollama,claude,none}.mjs`. Customer flips `llm.provider` in `automation-config.json`. Customer's own API key for Claude. Hirobius never in the LLM data path.
4. **n8n is the orchestration layer** (replaces broken Zapier). Workflow JSONs live under each automation's `n8n/` folder.
5. **Manifest-driven `/ops` dashboard** auto-syncs new clients via Vite's `import.meta.glob`. New clients onboard via `cp -r clients/_template clients/<new-slug>`.
6. **PII never persisted** — `_log.jsonl` and `inbox-discovery-results/` are gitignored. Adapters log only metadata (`text.length`, `usage`, `latencyMs`), never message contents.
7. **No new dependencies in the runtime** — every adapter and workflow uses Node built-ins only. New deps require explicit justification.

---

## Deferred decisions (Adrian-owned)

These don't block scaffolding work but they gate the install runbook + the timeline conversation. Resolve before Phase 1 reaches handoff.

| # | Decision | Options | Why deferred |
|---|----------|---------|--------------|
| D-1 | n8n hosting | Conrad's PC / Hetzner VPS (his account) / n8n Cloud | INSTALL.md is concrete only after this lands. PC default is reasonable. |
| D-2 | Phase 1 timeline | end-of-May 2026 / mid-June 2026 / end of Q2 | Most blockers are on Conrad's side; aggressive vs. conservative is judgment. |
| D-3 | `cancellation-winback` phase | Phase 1 (in retainer scope) / Phase 2 (separate work item) | Not named in `retainer.json` text but scaffolded as Phase 1. Affects retainer-vs-Phase-2 line. |

---

## Adrian's punch list (only humans can do these)

Priority order. Mostly serial; some parallelizable.

| # | Item | Effort | Notes |
|---|------|--------|-------|
| 1 | M365 dev tenant + Azure AD app provisioning | ~20 min | Per `docs/operations/m365-dev-tenant-setup.md`. Single biggest unblocker. |
| 2 | Lawyer call → MSA + SLA + light DPA template | ~1 week, $2–5K | Tech-contracts attorney. Software-vendor scope, not data-processor. |
| 3 | Bind cyber + E&O insurance | ~1 week, $1–2K/yr | Hiscox / Coalition / At-Bay. Software-vendor scope. |
| 4 | Sign Anthropic standard DPA | ~5 min, free | Online. Even though Conrad uses his own key, we need our own DPA to call the API at all (e.g., for our internal dev/test). |
| 5 | Confirm Conrad's EZLynx login arrived | ~5 min | He sent it 2026-05-01 from `administration@lilacinsure.com`. Verify receipt. |
| 6 | Prompt Conrad: WordPress + Gravity admin access | conversation | Required for `lead-intake` live. |
| 7 | Meeting w/ Conrad — walk through 12 email-triage categories (`tasks.json` 2-1) | ~1 hr | Validates / culls / renames our placeholder buckets. |
| 8 | Approve auto-responder template copy with Conrad | ~1 hr | His voice, his signature block. |
| 9 | Resolve D-1 / D-2 / D-3 from the deferred decisions table | judgment call | Unblocks INSTALL.md and timeline. |
| 10 | Phase 1 invoice + retainer top-up | accounting | Conrad confirmed checks-in-mail 2026-04-30. |

---

## Autonomous backlog (Hirobius platform handles via prompts)

Adrian green-lights each item; the system executes. Rough dependency order.

| # | Item | Depends on |
|---|------|-----------|
| 1 | Wire `discovery.mjs --from-graph` (currently a TODO placeholder in code) | M365 access |
| 2 | Run Pattern A discovery against M365 dev tenant fixture | #1 |
| 3 | Author `INSTALL.md` for Conrad (Docker Desktop, Ollama, n8n, env keys) | D-1 (n8n hosting) |
| 4 | Author `OPERATOR.md` (operator runbook) | INSTALL exists |
| 5 | Wire EZLynx live calls (replace the `dryRun` branch in `ezlynx-client.mjs`) | EZLYNX_API_KEY in env |
| 6 | Render brand audit deck from `brand-audit.json` | nothing |
| 7 | Build per-bucket email reply templates library | Conrad approves voice |
| 8 | Pattern A live run on Conrad's real inbox + report | M365 + Conrad consent |
| 9 | Call transcription POC (Phase 2 pro bono) | LightSpeed export, time |
| 10 | `_log.jsonl` parsing → "last run" timestamps in `/ops` automations panel | nothing |
| 11 | `/ops/clients/<slug>/report` route → bookmark-able async status page | nothing |
| 12 | Promotion-checklist progress parser → roll-up into automations panel | nothing |

---

## Dependency map (what's blocking what)

```
M365 dev tenant (Adrian #1)
  └── email-triage live test
  └── auto-responder live test
  └── Pattern A discovery on real inbox
  └── inbox discovery report (Phase 2 pro bono pb-1)

EZLynx API key + activation (Conrad → Adrian #5, BGI ticket #1943345)
  └── lead-intake live (postApplicant)
  └── renewal-reminder live (webhook subscribe)
  └── cancellation-winback live (webhook subscribe)
  └── EZLynx field-map validation (smoke test)

WordPress + Gravity admin (Conrad → Adrian #6)
  └── lead-intake live (Gravity webhook signature)

Conrad's category sign-off (Adrian #7)
  └── email-triage promotion to production

Conrad's template approval (Adrian #8)
  └── auto-responder promotion
  └── renewal-reminder promotion
  └── cancellation-winback promotion

n8n hosting decision (D-1)
  └── INSTALL.md final form
  └── workflow deployment (any workflow promoted to production)
```

---

## Communication cadence

**Default:** weekly status email to Conrad on Mondays linking to a stable URL on `/ops/clients/lilac-insure` (password-gated). The page reads the same `tasks.json` we're maintaining; it never goes stale. Adrian writes a 2–3 sentence intro per email; the rest is the rendered dashboard.

**Phone calls:** by Conrad's request only. Adrian's stated preference is async-first.

**Ad-hoc updates:** when a workflow promotes from test → production, send a short "shipping `<workflow>` today" email with the per-workflow promotion-checklist results.

The `/ops/clients/<slug>/report` route in the autonomous backlog (item #11) is what makes this cadence cheap to maintain — a single route + print CSS + a tiny weekly cron that emails the link. Until that ships, status emails point at a static doc URL.

---

## Source-of-truth pointers

- **Per-workflow specs:** `automation-plan.md` (table) + `automations/<id>/README.md` (per workflow)
- **Per-system status:** `automation-config.json.systems`
- **Per-task status:** `tasks.json` (surfaced in `/ops/clients/lilac-insure`)
- **Engagement context:** `notes.md` (relationship + Conrad's words + dream feature)
- **Stack inventory:** `stack.json`
- **Discovery questions:** `inbox-discovery-prompts.md`
- **Brand audit data:** `brand-audit.json`
- **M365 setup runbook:** `docs/operations/m365-dev-tenant-setup.md`

If any of these contradict each other, the source of truth is whichever was edited most recently — and someone needs to reconcile them. This file (`ROADMAP.md`) is the *scope* truth; the others are *implementation* truths.
