# Client template

Client records are business-confidential and often carry PII, so they must
**never be committed to this public repo**. The `/ops` client surfaces read them
from the private Supabase `client_records` table (migration
`0015_client_records.sql`) via `GET /api/clients`. This folder is the only
committed example, and every value in it is a `<<placeholder>>`.

When onboarding a new client:

```bash
cp -r clients/_template clients/<new-slug>   # gitignored — stays on your machine
```

Walk the files below and replace every `<<placeholder>>` with real values, then
load the folder into the private store:

```bash
node --env-file=.env.local scripts/import-client-records.mjs          # dry run
node --env-file=.env.local scripts/import-client-records.mjs --apply  # write
```

The import is idempotent (re-running only writes new or changed clients) and
never deletes. Files marked **(optional)** can be skipped — the `/ops` pages
handle missing files gracefully.

## Keeping the store in step

The `/ops` pages show the store, not these files, so a change here is invisible
until it reaches the store:

- **Hand edits** — re-run the `--apply` command above. Under `pnpm dev` the
  client pages show a warning naming every client whose local folder differs
  from the store (or that the import would reject), until you do.
- **`scripts/auto-assigner.mjs`** (the Telegram/Discord bots and `/api/route`)
  syncs the client whose `tasks.json` it edits. If that sync fails (e.g. no
  Supabase keys in `.env.local` on that machine), the bot reply and the
  assigner's stderr say so and give the fix.
- The import overwrites the store with **this machine's** copy, so run it where
  `clients/` is current (e.g. on the VPS if the bots run there).

The `_template/` folder itself is **never imported and never shown**: slugs
starting with `_` are scaffolding. Don't rename it. Slugs must be lowercase
kebab-case; use a pseudonymous slug (e.g. `client-alpha`) anywhere a slug could
end up in code, tests, docs, issues or PRs.

## Files

| File                           | Required?                   | Edit before launch                                 |
| ------------------------------ | --------------------------- | -------------------------------------------------- |
| `meta.json`                    | yes                         | identity, contact, scale, status                   |
| `tasks.json`                   | (optional)                  | starts empty; add phases as you scope              |
| `checklist.json`               | (optional)                  | access / security / payments gates                 |
| `retainer.json`                | yes if billing              | scope, currency, blockers                          |
| `goals.json`                   | (optional)                  | micro / macro outcomes                             |
| `status.json`                  | (optional)                  | contact cadence                                    |
| `automation-config.json`       | yes if shipping automations | mode + recipients + system env keys + LLM provider |
| `automations/<id>/config.json` | (optional)                  | one folder per workflow                            |
| `brand-audit.json`             | (optional)                  | touchpoints + quick wins for the brand-audit deck  |

## What's wired automatically

- `/ops/clients/<new-slug>` renders without any code change once imported
- Tasks, checklist, retainer, goals all surface from their record fields
- `automation-config.json` (if present) shows the Automations panel with
  system readiness + LLM provider + workflows

## Conventions you should keep

- **One JSON file per concern.** Don't pile everything into one mega-file.
- **`status` strings already mapped:** `todo` / `in-progress` / `blocked` /
  `done` / `pro-bono` / `phase-2-candidate` / `pending-activation` /
  `pending-access` / `scaffolded`. Stick to these so the dashboard renders
  correct status pills without code changes.
- **`automationRef` on tasks** — use this to link a task to its implementing
  workflow folder (e.g. `"automationRef": "automations/lead-intake"`).
  Dashboard renders an "automation" badge on those tasks.
- **Test mode default** — every `automation-config.json` ships with
  `mode: "test"` and a `testRecipient` you control. Promote to production
  per-workflow, never globally.
- **No secrets in JSON.** Only env-key _names_ live here; values stay in
  `.env.local` (which Hirobius does not touch).
