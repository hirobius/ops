# CLAUDE.md

Hirobius **Ops** — the agency operations dashboard: leads → site pipeline,
client CRM, projects/digest/tasks, build telemetry. It **consumes**
`@hirobius/design-system` for UI; it does **not** author the design system (that
lives in its own repo). Stack: Vite + React Router + Vercel serverless functions.

## 0. HARD RULES (no exceptions, apply to all agents including Claude)

- **NEVER read, write, create, or delete `.env*` files.** Keys are set by the human only. If a task needs a new key, document it in a comment in the script and stop — do not touch `.env.local`.
- **NEVER git push.** Local commits only.
- **NEVER run `pnpm check:release` or deploy commands.**
- **`/ops` is gated in production** by a server-side password: `api/ops-login.ts` checks `OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` and sets an httpOnly session cookie. Adrian sets those in the Vercel dashboard env (Production + Preview scopes). `pnpm dev` bypasses the gate. Claude must never read or write `.env*` files.

---

## 1. What to read first

- **Current state / what's next:** `docs/ai/HANDOFF.md` — start here on any short or open-ended prompt ("continue", "go", "status") and act from its Next queue.
- **Focus contract:** `docs/ai/NORTH_STAR.md` — if a request materially expands scope beyond it (infrastructure that doesn't ship a paying client site sooner), flag the drift in one sentence, then do what Adrian decides. Sessions never edit that file.
- **Delivery architecture (lead → site pipeline):** `docs/ARCHITECTURE.md`.
- **Guardrail registry:** `docs/guardrails/registry.json` — every `scripts/check-*.mjs` / `audit-*.mjs` gate with its `firingChannel`; `validate-guardrail-registry` keeps registry ↔ scripts consistent.
- **Context awareness:** look for local `CLAUDE.md` files in subdirectories for overriding rules before editing.

**Before ending a session that did real work:** update `docs/ai/HANDOFF.md` (Now / Next / Parked / one Done-log line) and refresh root `status.json` (the fleet dashboard renders it); include both in the final commit.

**Voice-dictation resilience:** Adrian often dictates; transcripts carry homophone artifacts ("stray" → "strategy"). Act on the evident intent; ask only when genuinely ambiguous.

## 2. AGENT EXECUTION PROTOCOL (MANDATORY)

1. **PRE-FILTER:** Before writing code, analyze whether the request affects UI, Layout, CSS, or Components.
2. **AUTO-VALIDATE:** If UI/Layout is affected, autonomously run `pnpm typecheck` and `pnpm test:layout` after your changes, before your final response.
3. **SELF-HEAL:** If tests fail, read the output, fix the error, and re-run until green — don't ask for help.
4. **FINALIZATION:** Only report a task complete when tests are 100% green.

### Working-with-Adrian conventions (standing prefs, 2026-07-06)

- **Give paste-ready text for every human-filled field.** When a setup step needs Adrian to type into a description/name/value field (Vercel env var, GitHub token name, Supabase key, etc.), supply the exact copy-paste text — never leave him to guess what to write.
- **Token/secret-backed features must fail loud and actionable.** Any feature that depends on an env token or secret must catch the failure and return a message that names the variable AND the fix (e.g., "GITHUB_TOKEN is expired/revoked — rotate it in Vercel → Settings → Environment Variables (Production), then redeploy"), never a generic/cryptic error. Build this in when you build the feature, not after it breaks.

## 3. SUB-AGENT DISPATCH RULES

- **Pick the cheapest model that can do the job.** `sonnet` is the default for source-code work and is **required for any task involving deletions** (file removals, dead-code pruning, dependency removal). `opus` only for cross-cutting architectural reasoning, ambiguous scope, or subtle validator logic — use sparingly.
- **Decision rule:** if the task asks "what's idiomatic in THIS codebase?" (picking a primitive, a token path, a framework import), that's `sonnet`.
- **Effort:** default to minimum; reserve high-effort for opus-class reasoning.
- **Worktree isolation:** use `isolation: "worktree"` for any pod where two agents could touch the same file.
- **One unit per agent**, fresh context — lower token cost, cleaner diffs, no cross-unit bleed.
- **Concurrency across sessions:** branch-per-session (each session on its own `claude/*` branch); never two sessions on one branch — conflicts then surface at merge, never as silent overwrites.
- **Lean prompts:** write "Follow CLAUDE.md dispatch rules" rather than repeating them; reference specs by path; no large file excerpts; one sentence per note.
- **Justify** the model + effort choice in each Agent call's description, one line.

### NEVER bulk-lint:fix (Pod N incident, 2026-05-01)

`pnpm lint:fix` over the whole codebase has introduced syntax errors by merging unrelated code blocks. **Rule:** lint:fix is per-rule with verification:

- Scope it: `pnpm exec eslint src --fix --rule '{"<rule-name>": "error"}'`.
- Run `pnpm typecheck && pnpm exec vite build` after EACH rule pass; STOP and report on failure.
- If a single rule's fix touches more than 50 files, STOP and ask Adrian.
- Safe to auto-fix: `@typescript-eslint/no-unused-vars`, `prefer-const`, `no-var`, `quotes`, `semi`, `eol-last`, `comma-dangle`. NEVER auto-fix `react-hooks/exhaustive-deps` or anything that rewrites code blocks rather than tweaking declarations.
