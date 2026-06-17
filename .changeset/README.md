# Changesets

Hi there! This folder has been created by `@changesets/cli`, a build tool that works
with multi-package repos, or can be used on a single-package repo to provide a
structured workflow for releasing packages.

## Workflow

**Adding a changeset (when a PR is ready to ship):**

1. Run `pnpm changeset:add` (or `changeset add` once `@changesets/cli` is installed)
2. Select the bump type: patch / minor / major
3. Write a short user-visible description of the change
4. Commit the resulting `.changeset/<random-id>.md` file with your PR

**Releasing (on the main branch):**

1. Run `pnpm changeset:version` to consume `.changeset/*.md` files and bump `package.json` + `CHANGELOG.md`
2. Commit the version bump + updated changelog
3. Tag the release: `git tag v<version>`

## Setup

`@changesets/cli` is not yet installed as a dev dependency. To activate the full
workflow:

```sh
pnpm add -D @changesets/cli @changesets/changelog-github
```

The `config.json` in this directory is pre-configured for the `hirobius/adrian-milsap` repo.
