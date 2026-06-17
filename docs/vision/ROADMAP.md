# Hirobius Platform Roadmap

_Last updated: 2026-05-01 PM (Sprint 2 closed). Agents: read this before planning new units._

---

## 1. The Platform

Hirobius is becoming an **agency platform**, not just a design system.

- HDS is the foundation layer: tokens, components, validators, AI context.
- The platform layer adds: multi-tenant theming, Figma automation, client delivery scaffolds.
- The business model: Adrian delivers high-quality sites faster by building leverage — every client reuses HDS, every workflow improvement compounds.
- Concrete Creations e-commerce (WA LLC) is the first external pilot consumer of this stack.

---

## 2. Active Sprint — Sprint 3 (Sprint 2 closed 2026-05-01)

Sprint 2 closed with the typography polish + info-page interaction
work landed:

| ID | Name | Status | Commit |
|---|---|---|---|
| 12a-3 | Bump Clash Display to medium/500 weight | done | `85dcdba` |
| 12a-4 | Brand-blue swatch contrast — repair OKLCH→RGB | done | `b4ffa0c` |
| 12a-5 | Zero raw inline typography in non-bypassed source | done | `1e847c2` |
| 12b-1 | Info page surface + grid spacing fix | done | `0cc660e` (Wave 2) |
| 12b-2 | Info page smart-animate profile-image expand | done | `f81590c` |

Agent-infra units `12g-1` and `12g-2` were folded into the Wave 2
sprint close (`0cc660e`) and are tracked there. Other Sprint 2 units
in `orchestration.json` (12c-*, 12d-*, 12e-*, 12f-*) remain open and
can be drained alongside Sprint 3 by priority.

---

## 3. Next Sprint — Sprint 3 Priorities

| ID | Name | Priority | Depends |
|---|---|---|---|
| 12h-1 | Multi-tenant CSS token theming | P1 | — |
| 12h-2 | Figma plugin: §7 auth envelope | P1 | — |
| 12h-3 | Figma plugin: template injection | P2 | 12h-2 |
| 12h-4 | Figma plugin: build status → Figma page | P2 | 12h-2 |
| 12h-5 | Vision board tab in /wet-paint | P2 | — |
| 12h-7 | UI Skills: motion performance ingest | P2 | — |
| 12h-8 | UI Skills: interaction design ingest | P3 | — |

Start with `12h-1` and `12h-2` in parallel — they are independent and unblock everything else in the cluster.

---

## 4. Agency Model

**Client tiers (working model):**

- **Tier 1 — Brand presence:** Marketing site, portfolio, or landing page. HDS base, one tenant token override, 2–4 week delivery.
- **Tier 2 — E-commerce:** Stripe Checkout (hosted), product catalog, WA-compliant legal pages. 4–8 weeks.
- **Tier 3 — Product:** Custom application logic, auth, dashboards. Scoped separately.

**Concrete Creations pilot (12h-6 — parked, Sprint 4):**

- WA State LLC selling concrete/stone home goods.
- Separate repo, imports HDS as a dependency.
- Applies `[data-tenant='concrete-creations']` CSS scope for warm stone/brown accent palette.
- Stripe Checkout for launch — no custom payment UI.
- Unblocked once 12h-1 (multi-tenant theming) is complete.

---

## 5. Figma Plugin Roadmap

**Built:**
- SSE stream connection to bridge (`/stream`)
- Canvas writes: ADD_NODE, UPDATE_NODE via JSONL
- Selection extraction + fix-mode prompting
- Token sync (`/update-manifest`)
- Master variant batch generation (`/build-masters`)

**Sprint 3 additions:**
- `12h-2` — Auth envelope: `HDS_BRIDGE_SECRET` + HMAC-SHA256. New `/pair` endpoint.
- `12h-3` — Template injection: dropdown of 5 layout templates (home-hero, product-detail, about, contact, digital-biz-card). New `/inject-template` endpoint.
- `12h-4` — Build status sync: reads `orchestration.json`, renders status frame on `🔄 Build Status` Figma page. New GET `/build-status` endpoint.

**Known tech debt:** All plugin URLs hardcoded to `localhost:3005`. Tracked but not in current sprint scope.

---

## 6. Knowledge Base

`docs/vision/` is the planning home. No external tools (Google Docs, Notion) for system planning.

| File | Purpose |
|---|---|
| `ROADMAP.md` (this file) | Top-level vision + sprint state |
| `roadmap.json` | Machine-readable roadmap for agent consumption and /wet-paint Vision tab |
| `prompts.json` | Reusable agent prompts + tags |
| `references.json` | UI Skills + external reference library |
| `inspirations.json` | Visual references and design links |

The `/wet-paint` page will get a Vision tab (unit `12h-5`) that renders these JSON files as HDS-styled lists.

---

## 7. UI Skills Status

Six skills tracked. Ingestion status:

| Skill | URL | Status |
|---|---|---|
| ibelick/fixing-motion-performance | ui-skills.com/skills/ibelick/fixing-motion-performance | Pending (12h-7) |
| wshobson/interaction-design | ui-skills.com/skills/wshobson/interaction-design | Pending (12h-8) |
| accesslint/audit-and-fix | ui-skills.com/skills/accesslint/audit-and-fix | Parked — a11y covered by existing axe gates |
| swiss-canon (internal) | validators/swiss-canon.mjs | Done — supersedes 8h-1 |
| (slots 5–6) | TBD | Not yet identified |

Priority order: motion performance first (adds validator rules), interaction design second (enriches Figma plugin context for template injection).
