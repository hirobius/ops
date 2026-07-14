# ROADMAP — the one source of truth (read this first)

> **This file overrides every handoff, plan, and status wall-of-text.** If another
> doc disagrees with this one, this one wins. Six drifting handoff docs and a
> paragraph-long `status.json` were the scope creep. This is the cure: one goal,
> three deliverables, one freeze list.
>
> _Owner: Adrian · Established: 2026-07-14 · Supersedes the planning function of
> `HANDOFF.md` and the historical handoff exports._

---

## The one goal

**One paying client — live and invoiced.** Nothing else is a real milestone.

**The creep test.** Every proposed piece of work faces exactly one question:

> _Does this get client #1 live and paying, or make client #2 materially cheaper?_

If the answer is no, it gets an issue and goes on the freeze list. **No exceptions —
including from Claude.** "It would be cleaner / more robust / more automated" is not
a yes. Ship first, perfect later.

**Why this exists.** The product already works — Monroe, Lilac Bonds, and the three
realtor sites are all excellent sites hand-built with no key and no pipeline. The
blocker was never site quality; it was that we keep building the *machine that makes
sites* instead of *selling one site*. The 2026-07-08 freeze said this and didn't
hold. This roadmap is the freeze that holds.

---

## The three deliverables (in order — do not parallelize)

### D1 — Launch Lilac Bonds **as-is**, live and un-gated
Conrad Milsap is the realest client: a named person with a code-complete,
Lighthouse-98 site. **Ship the Vite site that exists.** The Astro migration is
frozen (see below) — rebuilding a finished site for architectural purity is the
exact creep that's killing the project.

- **Adrian:** collect Conrad's real data (license #, trust facts, FAQ specifics);
  register `lilacbonds.com`; create the Formspree form + CallRail number; disable
  the Vercel auth wall; set `SITE_LIVE`.
- **Claude (buildable):** drop Conrad's real data into `lilac-bonds/src/data/*`
  (never fabricate — placeholders stay placeholders until real facts arrive);
  verify the quote-form payload end-to-end; produce the launch checklist.
- **DONE =** `lilacbonds.com` is live with real data and a working quote form.

### D2 — Get paid (Stripe no-code, ops#200)
Already decided; just execute. Payment Link (build fee) + Subscription
(~$79/mo care plan). No code to build.

- **DONE =** first payment received from Conrad.

### D3 — The no-key "client #2" path (**only after D1 + D2 land**)
This is where the "build without an Anthropic API key" work belongs — scoped to
the minimum that makes a second client cheaper, not a generation rework.

- Wire the render button (**ops#185**): dispatch `render`, surface `configFile` +
  `commands`, add the `'rendered'` status.
- Vendor `leadToConfig()` (canonical in `site-engine/packages/schema`) into ops's
  `lib/schema` as the no-key floor + `Generate` fallback.
- Delete the retired Duda stub (`lib/duda`, `buildLeadSite`, `publishLeadSite`).
- **DONE =** a second lead → config → deployed preview with no hand-authored
  config and no Anthropic key.

---

## The freeze list — nothing here moves until a client pays

Each item is real work that will matter *later*. None of it gets client #1 live.
File issues, then leave them alone.

- **Lilac Astro migration** — ship the working Vite site instead.
- **Bespoke-generation rework, Phases 1–4** — a quality play with zero paying
  clients complaining about quality.
- **Ralph loop expansion / actions-minutes / self-hosted runner.**
- **All HDS (design-system) work** — it does not style client sites.
- **Blind-spot gates (BS1–BS7), guardrail-drift guards, skills-locks,
  vacuous-spec fixes.**
- **Digest P2–P4, fleet-health, analytics field, multi-page tier, realtor-kit
  polish, Pexels stock photos.**
- **The visual-sameness / aesthetic problem** — irrelevant with no client who cares.
- **Any new strategy / handoff / context doc** beyond this file.

---

## Live status (keep this to five lines — the only status that matters)

- **Now:** D1 — Lilac Bonds launch. Waiting on Adrian's data + accounts (see D1).
- **Next:** D2 — Stripe (ops#200).
- **Blocked:** D3 is intentionally blocked until D1 + D2 land.
- **Last shipped:** roadmap established; scope frozen (2026-07-14).
- **Client #1 revenue:** $0 — the one number to move.
