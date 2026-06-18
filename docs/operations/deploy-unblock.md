# Deploy unblock — getting the ops dashboard live on Vercel

The new dashboard (`hirobius-ops` Vercel project, this repo) has **never** built
successfully. Verified from the build logs — two failures, in order:

1. **Pre-existing, the real blocker.** `ENOENT: no such file or directory, scandir
   '/vercel/hirobius-design-system'` → `pnpm install` exits 254. `package.json`
   depends on `@hirobius/design-system` via `file:../hirobius-design-system`; on
   Vercel only this repo is cloned, so the sibling doesn't exist. This failed on
   the **first `main` import**, before any leads/Duda work.
2. **Added by the integration work.** `ERR_PNPM_OUTDATED_LOCKFILE` —
   `@supabase/supabase-js` is in `package.json` but not `pnpm-lock.yaml`. (Moot
   until #1 is fixed; `pnpm install` resolves it once the DS dep can install.)

> Heads up on naming: the currently-live `ops-dusky` / `ops` Vercel project is the
> **old markdown tracker** — a different, simpler codebase. The dashboard you want
> live is the `hirobius-ops` project. Decide which is canonical (see cleanup below).

## Fix A — make `@hirobius/design-system` resolvable (pick one)

### Option 1 — Publish the package *(recommended; fixes CI, Vercel, fresh clones)*
1. In the **design-system repo**: set `version`, and publish to **GitHub Packages**
   (private-repo friendly): add `"publishConfig": { "registry": "https://npm.pkg.github.com" }`,
   then `npm publish` (ideally via a release/tag CI job). Preserve the subpath
   exports (incl. `./tokens`, `./cn`, `./manifest`).
2. In **this repo**: change the dep to a version range —
   `"@hirobius/design-system": "^X.Y.Z"` (drop `file:../…`). Add `.npmrc`:
   ```
   @hirobius:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
   ```
3. In **Vercel** (`hirobius-ops` project): add env `NODE_AUTH_TOKEN` = a GitHub PAT
   with `read:packages`, so install can authenticate.
4. `pnpm install` → commit `package.json`, `.npmrc`, `pnpm-lock.yaml`.

### Option 2 — Vendor the built package *(fastest path to a preview today)*
1. Build the design-system (`pnpm build` in its repo) → `dist/`.
2. Copy `dist/` + its `package.json` into this repo at
   `vendor/hirobius-design-system/` (keep the `exports` map intact).
3. Change the dep to `"@hirobius/design-system": "file:./vendor/hirobius-design-system"`
   (path is now **inside** the repo, so Vercel's clone has it).
4. `pnpm install` → commit the vendored folder + `pnpm-lock.yaml`.
   - Trade-off: must re-vendor on DS changes (worth a small sync script). Good as an
     interim; migrate to Option 1 for the long term.

### Option 3 — Monorepo / submodule *(heaviest)*
Combine both packages into one pnpm-workspace repo, or add the DS as a git submodule
inside this repo and set the build command to `git submodule update --init && …`
plus an in-repo `file:` path. Most restructure; only worth it if you're consolidating
repos anyway.

## Fix B — sync the lockfile
Do this in the **same environment where the DS dep now resolves** (after Fix A):
`pnpm install` → commit the updated `pnpm-lock.yaml`. This clears the
`ERR_PNPM_OUTDATED_LOCKFILE` (picks up `@supabase/supabase-js`).

## Then ship the preview
1. Push the branch → `hirobius-ops` auto-builds a **Preview Deployment** (URL on the
   commit/PR). No manual `vercel deploy` needed.
2. Set Vercel env (Production **and** Preview scope): `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`,
   `DUDA_API_USER`, `DUDA_API_PASS`. Without Supabase the board still renders — it
   shows the offline banner.
3. Run migrations `0001_leads.sql` then `0002_lead_site_fields.sql` in Supabase.
4. Validate locally first (now possible once DS resolves):
   `pnpm typecheck && pnpm test:layout && pnpm build`.

## Project/repo cleanup (related, do once)
- Pick the canonical live target: **`hirobius-ops`** (new dashboard) vs **`ops`**
  (old tracker). Repoint the production domain to the winner; archive/retire the
  other so previews and prod land in one place.
- Confirm the canonical **repo**: the dashboard lives in `hirobius/hirobius-ops`
  (Vercel repoId 1272748944); agent sessions are scoped to `hirobius/ops`. Align
  these so pushes trigger the right project.

## Why this can't be done from the agent container
The agent container has no `../hirobius-design-system` either (same ENOENT), so I
can't run `pnpm install`, regenerate the lockfile, vendor a built `dist` (no source
here), or publish (no source / registry creds) — and deploying is a hard-rule no.
The steps above are the entire fix; all need an environment that has the
design-system (your machine or its own CI).
