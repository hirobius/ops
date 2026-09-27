# Tool/MCP payload audit — ops#427

Repo-local, measurable slice of ops#427. Full `/context` + logging-proxy
measurement per the issue's other two DoD boxes needs an interactive session
and is **not done here** — see "Remaining" below.

## What was audited

`.claude/settings.json` in ops carried no `deny`, `disable*` or
`skillOverrides` entries (confirmed against `origin/main`, 2026-09-25, per the
issue). `.mcp.json` declares one server: `playwright` (used by
`pnpm test:layout` / CLAUDE.md §4's browser-verify step — kept, untouched).

The other MCP servers ops sessions carry are claude.ai cloud connectors, not
`.mcp.json` entries, so `disabledMcpjsonServers` can't reach them and
`disableClaudeAiConnectors` is all-or-nothing — it would also cut GitHub,
Vercel and Supabase, which Adrian named as keepers. The only lever that hits
an individual connector without touching the others is a bare-name
`permissions.deny` entry naming that server.

## Kept (ops workflows call these)

| Server       | Why                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `github`     | Issue tracking, dispatch, PR review — the fleet's tracker (`lib/tasks/actions.mjs`, `ralph/*`).  |
| `Vercel`     | Deploy/env diagnostics, the `/api/projects` fleet dashboard's deployment reads.                  |
| `Supabase`   | DB inspection/migrations — `leads`, `lead_notes`, `digest_items`, the migration-ledger gate.     |
| `playwright` | `.mcp.json`-declared, used by `pnpm test:layout` and CLAUDE.md's Playwright browser-verify step. |

## Denied (bare-name `permissions.deny`, `.claude/settings.json`)

Each entry strips that server's tool definitions from every turn's payload.
None of these is referenced anywhere in ops's scripts, CLAUDE.md, or the
guardrail registry — ops is an operations dashboard, not a design, docs, or
personal-productivity surface:

- `mcp__Figma` — design-system authoring lives in `hds`, not `ops` (ops's own
  CLAUDE.md says it consumes `@hirobius/design-system`, never authors it).
- `mcp__Gmail`, `mcp__Google_Calendar`, `mcp__Google_Drive` — no email/
  calendar/drive automation anywhere in ops; outreach uses its own
  `lib/outreach/` + Discord, not these connectors.
- `mcp__Wix` — no Wix surface in the fleet.
- `mcp__Excalidraw` — no diagramming workflow in ops's scripts or docs.
- `mcp__Claude_Docs` — ops's own convention (CLAUDE.md §1, convention #4) is
  HTML Artifacts and checked-in Markdown for plans/reports, not the Docs
  connector.

## `skillOverrides: "off"` (bundled Anthropic skills, not the vendored set)

Only Anthropic's own bundled skills are touched — `disableBundledSkills` was
deliberately **not** set, since it would also affect built-in slash commands;
`.claude/skills/` (the vendored Matt Pocock set: `code-review`,
`codebase-design`, `diagnosing-bugs`, `grill-me`, `implement`,
`improve-codebase-architecture`, `tdd`, `to-tickets`, `triage`) is unaffected
by either lever per its own documentation and stays fully on, per CLAUDE.md
§2's "MANDATORY, not optional."

Turned off: `algorithmic-art`, `built-in-browser`, `chrome-browser`,
`computer-use`, `docx`, `pptx`, `xlsx`, `import-memory`, `morning`,
`extract-design` (client-site design extraction is `site-engine`'s job, not
ops's), `keybindings-help`, `session-start-hook`. None has a call site in ops.

Left on despite being plausible-unused, for lower confidence of "clearly":
`pdf`, `skill-creator`, `deep-research`, `claude-api`, `workflow-authoring`
(Workflow is explicitly a keeper — ultracode burndowns), `run`, `init`,
`security-review`, `dataviz` (directly relevant — ops **is** a dashboard),
`fewer-permission-prompts`, `loop`, `simplify`.

## Steering-budget baseline (unaffected by this change)

`node scripts/check-steering-budget.mjs` on `HEAD` before this change:

```
12.2KB  CLAUDE.md
11.3KB  docs/ai/HANDOFF.md
 1.5KB  docs/ai/NORTH_STAR.md
———————
25.0KB  total (budget 25.0KB)
```

This number is the always-on **document** context (CLAUDE.md/HANDOFF/
NORTH_STAR), a separate axis from the MCP **tool-definition** payload this
issue targets — the settings.json change above doesn't move it, and it wasn't
expected to. It's recorded here as the "before" figure the issue's DoD asked
for; it is identical after, by construction (neither file was touched).

## Remaining (needs an interactive session — not agent-actionable here)

- **`/context` before/after totals** in ops, hds and site-engine (DoD box 1)
  and the **per-tool ranking via the logging proxy** (`node proxy.mjs` +
  `ANTHROPIC_BASE_URL=http://localhost:8787 claude`, DoD box 2) both need an
  interactive `claude` session with a live model connection — this session is
  a non-interactive dispatched agent and cannot run either.
- **hds and site-engine's own `.claude/settings.json`** are out of scope for
  this repo-local slice; each needs its own audit against its own workflows
  (hds's Figma-heavy CLAUDE.md almost certainly keeps `mcp__Figma`, which is
  exactly why this is "per-repo, not a blanket copy" per the issue).
- **One green Ralph iteration and one dispatched `@claude` task post-change**
  (DoD's last two boxes) — needs a real fleet run after this merges.
- `bash ralph/gate.sh` was not run in this session (see checks below); rerun
  before closing the issue.
