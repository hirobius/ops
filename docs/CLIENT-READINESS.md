# Client readiness — gap map vs. agency tooling stacks (2026-07-13)

Adrian's question: *"have we gone too far down the wrong road — can I support a
paying client's required work without hacking more infrastructure together?"*
Answered by comparing this stack against what client-serving platforms bundle
([GoHighLevel](https://www.gohighlevel.ai/blog/gohighlevel-features-list),
[Duda](https://www.duda.co/)) and against the standard
[WordPress care-plan checklist](https://theadminbar.com/what-is-a-website-care-plan-and-whats-included/)
(the $95–195/mo maintenance-package market — updates, backups, security,
uptime monitoring, content edits, monthly report).

**Verdict: the road is right.** The per-site product already matches or beats
platform output (forms + spam protection, SEO/JSON-LD, Lighthouse budgets in
CI, preview gating, placeholder-catching acceptance tests, clean eject
handoff), and static-sites-in-git make two care-plan pillars — backups and
security patching — structurally free. The gaps were **client-lifecycle**, not
site quality, and the small ones were closed this session. The one true
blocker is unchanged and is not tooling: the pipeline middle (first live
generate → published site, `docs/ARCHITECTURE.md` ③④).

## The gap table

| Capability | GHL / Duda / care-plan baseline | Us (before) | Decision / state (2026-07-13) |
|---|---|---|---|
| Site build + hosting | builder + hosting bundled | ✅ factory + Vercel per client | built — competitive |
| Forms + spam | bundled | ✅ Web3Forms + honeypot + hCaptcha | built |
| SEO / JSON-LD / perf | partial, varies | ✅ enforced in CI | built — stronger than baseline |
| Backups / security | care-plan pillar ($) | ✅ inherent (static + git) | free — sell it as included |
| **Change-request intake** | ticketing / CRM | 🔴 portal form → `console.log` | ✅ **BUILT**: `client_feedback` store (migration 0012) + /ops inbox panel |
| **Uptime / health monitoring** | 24/7 monitoring | 🔴 nothing watched live sites | ✅ **BUILT**: `scripts/fleet-health.mjs` (factory's own verify-live assertions; manual trigger, cron needs Adrian's yes) |
| **Analytics** | dashboards bundled | 🔴 nothing (se#84 parked) | ✅ **BUILT**: Plausible decision + optional `ClientConfig.analytics` → script tag. Adrian: create account + add domains |
| **Billing** | GHL SaaS-mode @ $497/mo | 🔴 nothing | **BUY, don't build**: Stripe no-code — Payment Link (build fee) + Subscription (~$79/mo care plan). Tracked in the "Stripe no-code billing" issue |
| CMS / client self-serve edits | bundled editor | 🔴 none | **Care plan substitutes** (we make the edits — that's the paid product). Revisit Keystatic (se#41) at ≥5 clients if edit volume hurts |
| Monthly client report | care-plan pillar | 🔴 none | **Post-first-client** (needs a client + a month of Plausible/health data). Tracked in the "monthly client report" issue |
| Outreach / lead-gen CRM | GHL's core | 🔵 scaffolded (Smartlead, gated) | unchanged — client *acquisition*, separate track (#9) |

## Decisions recorded

1. **Billing = Stripe no-code.** Payment Links for one-off build fees, a
   Stripe Subscription product for the care plan. Zero code now; the "billing
   event = publish action" concept in `docs/ARCHITECTURE.md` ⑧ stands, with
   Stripe as the mechanism. Later (optional): record `invoice_url`/status on
   the client row. GHL charges $497/mo for the automated version of this;
   Stripe gives it for transaction fees.
2. **Analytics = Plausible** (se#84). One account, per-domain sites,
   cookieless (no consent banner), shareable per-client dashboards that feed
   the future monthly report.
3. **CMS = the care plan.** At our volume, "email us the change" (now landing
   in the /ops feedback inbox) + a config edit is faster than building/running
   an editor. Threshold to revisit: ≥5 active clients or edit volume that
   visibly eats build time.
4. **No GHL/Duda migration.** The moat (agent-generated `ClientConfig` →
   validated static site) doesn't exist on those platforms; buying one would
   trade the moat for convenience features we can attach piecemeal (Stripe,
   Plausible, UptimeRobot-class checks) at near-zero cost.

## What this session built (see Done-log / commits on `claude/action-minutes-wrap-up-ny7p91`)

- Portal feedback intake: migration `0012_client_feedback.sql` +
  `lib/portal-feedback.mjs` + fold into `api/portal-verify.ts` (12/12 function
  cap held) + `/ops` ClientFeedbackPanel.
- Fleet health: `lib/health/verify-live.mjs` (vendored factory assertions) +
  `scripts/fleet-health.mjs` (alert-log + Discord fail-soft).
- Plausible field: site-engine schema + BaseHead (canonical) re-synced to
  ops `lib/schema`.

Sources: [GoHighLevel features](https://www.gohighlevel.ai/blog/gohighlevel-features-list) ·
[GHL white-label pricing](https://ghlcrm.me/go-high-level-crm-white-label/) ·
[Duda](https://www.duda.co/) ·
[care-plan contents](https://theadminbar.com/what-is-a-website-care-plan-and-whats-included/) ·
[small-biz maintenance pricing 2026](https://websitemaintenanceservices.org/best-website-maintenance-for-small-business/)
