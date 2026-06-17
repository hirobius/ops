# Client template

When onboarding a new client:

```bash
cp -r clients/_template clients/<new-slug>
```

Then walk the files below and replace every `<<placeholder>>` with real
values. Files marked **(optional)** can be skipped initially — leave them
as-is or delete them; the `/ops` dashboard handles missing files gracefully.

The `_template/` folder itself is **excluded from the `/ops` dashboard**
because slugs starting with `_` are filtered out by `ClientDashboardPage`'s
manifest registry. Don't rename it.

## Files

| File | Required? | Edit before launch |
|------|-----------|-------------------|
| `meta.json` | yes | identity, contact, scale, status |
| `tasks.json` | (optional) | starts empty; add phases as you scope |
| `checklist.json` | (optional) | access / security / payments gates |
| `retainer.json` | yes if billing | scope, currency, blockers |
| `goals.json` | (optional) | micro / macro outcomes |
| `automation-config.json` | yes if shipping automations | mode + recipients + system env keys + LLM provider |
| `automations/` | (optional) | per-workflow folders, mirror Lilac's pattern |

## What's wired automatically

- `/ops/clients/<new-slug>` route renders without any code change
- Tasks, checklist, retainer, goals all surface from their JSON files
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
- **No secrets in JSON.** Only env-key *names* live here; values stay in
  `.env.local` (which Hirobius does not touch).
