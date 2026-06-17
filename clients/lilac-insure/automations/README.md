# Lilac Insure automations

Spec is in [`../automation-plan.md`](../automation-plan.md). Config is in
[`../automation-config.json`](../automation-config.json). This directory holds
one folder per Phase 1 automation, plus shared utilities.

## How a workflow runs

```
node clients/lilac-insure/automations/<workflow>/run.mjs [--live]
```

Default behavior with `mode: "test"` in the root config:
1. `config-loader.mjs` loads `automation-config.json` and the workflow's `config.json`.
2. `checkEnvKeys()` reports which env keys are present vs. missing for the systems this workflow touches.
3. The workflow logs a structured `dry-run` event to `_log.jsonl` (gitignored) describing what it *would* do.
4. Exit 0. No network traffic.

Flipping `mode: "production"` does not auto-promote a workflow — each `run.mjs`
must be wired against real systems and its README "Promotion checklist" satisfied.

## Layout

```
automations/
  README.md              ← this file
  _shared/
    config-loader.mjs    ← reads root + workflow config
    test-mode-guard.mjs  ← refuses live sends in test mode; enforces allowlist in production
    log.mjs              ← appends structured events to ../_log.jsonl
    ezlynx-client.mjs    ← REST client stub (Postman-derived)
    ezlynx-field-map.json
    EZLYNX.md            ← surface, status, smoke test
  _log.jsonl             ← runtime log (gitignored)

  lead-intake/           ← Bucket 1 — Gravity → EZLynx applicant
  email-triage/          ← Bucket 2 — Outlook bucket rules
  auto-responder/        ← Bucket 2 — lead acknowledgment
  renewal-reminder/      ← Bucket 4 — text/email replaces letters
  cancellation-winback/  ← Bucket 4 — win-back follow-up
```

Each workflow folder contains:
- `README.md` — trigger, input, process, output, dependencies, test plan, **promotion checklist**
- `config.json` — workflow-specific overrides (subjects, templates, sequence timing)
- `run.mjs` — executable stub; reads config, validates env keys, logs intent
- `fixtures/` — sample input payloads
- `n8n/` — workflow JSON exports (empty until n8n hosting is decided)

## Patterns inherited from `scripts/sync-client-emails.mjs`

- Env keys live in `.env.local` only — config files only carry the **key names**, never values.
- PII never written to disk. Logs carry structural summaries (`keyCount`, `sampleKeys`) not full payloads.
- Dry-run is the default. Live operation requires explicit opt-in.

## Hard rules (CLAUDE.md §0)

- Never read, write, create, or delete `.env*` files.
- Never `git push` from a workflow.
- No new deps until a workflow needs them. The stubs use only `node:fs`, `node:path`, `node:url`.
