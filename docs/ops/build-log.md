# Build & Decision Log — Access Tech launch + agency-OS hardening

> Running log of what we built and the decisions we made this push, so we can
> validate at the end that we did the right things. Newest entries at the top of
> each section. Started 2026-09-11.

## Built
- **Access Tech client portal** (`access-tech-internal`, powered by `portal-kit`):
  single gated page — proposal, "Why This Strategy", DIY appeal guide, roadmap,
  filming guide; document reader with callouts + collapsible sections;
  cross-doc links; Copy-for-AI (top + bottom); dark/light + iOS fixes;
  Vercel Web Analytics (raw script, zero-dependency).
- **portal-kit** shared static renderer (`theme.css` + `portal.js`): the reusable
  engine behind every client portal — markdown extras (`::: collapsible :::`,
  `> callout`, `[text](#doc)` cross-links), theme switcher, full-screen reader.
- **Access Tech CRM workspace** onboarded into `ops/clients/access-tech/`
  (local/gitignored; meta, retainer, checklist, tasks, goals, status).
- **Legal templates** — `docs/legal/MSA-template.md` + `SOW-template.md`
  (reusable; filled Access Tech version handed to Adrian separately).
- **This build log.**

## Decisions
1. **Profile-repair price = $400** — fair (market $300–800), refund-guaranteed,
   with a free DIY option; not the market floor, not gouging.
2. **Design system: unify tokens, not framework.** Client portals + Lilac stay
   vanilla/static (bulletproof, no build); ops stays React/HDS. One DTCG token
   source → generated CSS vars (portals) + React components (ops). Same visual
   language everywhere; right runtime per surface.
3. **All clients live in `ops/clients/`** — gitignored (PII-safe), rendered on
   `/ops/clients/<slug>`. Client *delivery* tasks live in the workspace
   `tasks.json`; the GitHub board stays for building the OS itself.
4. **Autonomy relaxed** — Claude pushes. ops changes go via `claude/*` branch +
   PR (never direct to prod `main`); client repos push freely.
5. **Operating Contract** adopted (autonomy tiers by blast radius; act-then-
   report; batch questions into one list). To be codified into auto-loading
   `CLAUDE.md` / user memory.
6. **Determinism = Codify + Enforce + Route.** Encode rules where they auto-load;
   gate the mechanizable ones; route decisions to a batched `needs-adrian` queue.
7. **Adopt Matt Pocock / AI Hero pieces:** git-guardrails hook (tuned to block
   destructive git, allow normal push); re-arm Ralph + Docker Sandbox for
   unattended runs; `/writing-for-agents`; the skills plugin (supersede vendored
   copies); an evals workstream to harden site-engine's LLM generation.
8. **`access-tech-internal` repo → private** (portal content was readable on a
   public repo despite the password gate).

## Open / to validate at end of push
- [ ] Access Tech workspace extracted into desktop `clients/access-tech/` +
      renders on `/ops/clients/access-tech`.
- [ ] MSA + SOW reviewed by counsel; filled Access Tech agreement sent to Phil.
- [ ] `access-tech-internal` repo set to **private** (Adrian).
- [ ] Vercel Web Analytics **enabled** in the project (Adrian).
- [ ] git-guardrails hook installed with the tuned blocklist (Adrian, at terminal).
- [ ] Determinism / autonomy audit run (next).
- [ ] Design-token unification built (portal-kit + Lilac ← one source).
- [ ] Operating Contract codified into auto-loading memory / `CLAUDE.md`.
- [ ] Ralph loop re-arm decision (autonomy dial).
- [ ] Hirobius internal agent — backlog idea.
