# Dependency Audit Log

**Repository:** @hirobius/design-system  
**Audit tool:** pnpm audit  
**Last run:** 2026-05-03  
**Runner:** 13s-1-dependency-hygiene

---

## 2026-09-16 — Secrets Audit (full history) + CI secret scan (ops#32)

Command (gitleaks 8.30.1, release checksum verified), run over every ref published to GitHub:
`gitleaks git --config .gitleaks.toml --redact --log-opts="--remotes=origin" .`

Scope: 479 commits with patches (510 commits reachable from `origin/*`, 244 of them on `main`), about 28 MB of diff. Re-running over every local ref (`--all`, 481 commits) and with the default rules alone (no repo allowlist) gave the same result.

### Findings Summary

| Rule                | Count | File                                                                       | Verdict                                                                                                                                               |
| ------------------- | ----- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slack-webhook-url` | 1     | `fixtures/check-secrets/violating.example.txt` (initial import, `b26b328`) | False positive: the check-secrets gate's intentional violating fixture. It is a placeholder webhook with zeroed workspace/bot IDs and an all-X token. |

**Real secrets found: 0. Nothing to rotate or purge.**

### Actions Taken

1. **Scoped the fixture's allowlist in `.gitleaks.toml`.** It extends the default `slack-webhook-url` rule and applies only when the path AND the placeholder regex both match. A different-shaped webhook in the same file is still caught (verified). The check-secrets fixture-proof run still fires because it scans a temp copy outside that path (verified). After this change, the full-history scan returns 0 findings.
2. **Added `.github/workflows/secret-scan.yml`.** It runs the pinned, checksum-verified gitleaks CLI on every PR (`base..head`) and every push to `main` (`before..after`), with `--redact`. A manual `workflow_dispatch` run scans the full history of the chosen ref, which covers the quarterly full scan listed under Cadence. It uses the CLI, not `gitleaks/gitleaks-action`, because the action requires a paid license for organization-owned repos.

---

## 2026-05-03 — Secrets Audit

Command: `gitleaks detect --source . --log-opts="--all" --config .gitleaks.toml`

### Findings Summary

| Severity | Count | Notes                                                               |
| -------- | ----- | ------------------------------------------------------------------- |
| Critical | 0     | No exposed secrets detected                                         |
| High     | 0     | —                                                                   |
| Moderate | 0     | —                                                                   |
| Low      | 0     | 115 historical false positives (design-token paths) now allowlisted |

### Actions Taken

1. **Installed `.gitleaks.toml`** with HDS-specific allowlists for design-token paths (`primitive.radius.*`, `primitive.size.*`, etc.) that were falsely matched by the generic API-key rule in `component-api.json` and `shape.json`.
2. **Added `gitleaks detect --staged` to `.husky/pre-commit`** so every commit is scanned before push.
3. **Verified `.env*` is in `.gitignore`** — already present.
4. **No keys required rotation** — all 115 findings were confirmed false positives; no actual secrets were exposed.

### Key Rotation Schedule

| Vendor / Service             | Rotation Cadence        | Last Rotated | Next Due   | Owner  |
| ---------------------------- | ----------------------- | ------------ | ---------- | ------ |
| GitHub Personal Access Token | Quarterly               | 2026-04-01   | 2026-07-01 | Adrian |
| Vercel Token                 | Quarterly               | 2026-04-01   | 2026-07-01 | Adrian |
| Anthropic API Key            | Quarterly               | 2026-04-01   | 2026-07-01 | Adrian |
| Discord Bot Token            | Quarterly               | 2026-04-01   | 2026-07-01 | Adrian |
| npm publish token            | On exposure or annually | 2026-04-01   | 2027-04-01 | Adrian |

**Procedure:** Rotate via vendor dashboard → update local `.env` → revoke old token immediately → record new last-rotated date in this log.

---

## 2026-05-03 — Dependency Hygiene

Command: `pnpm audit`

### Findings Summary

| Severity | Count | Packages |
| -------- | ----- | -------- |
| Critical | 0     | —        |
| High     | 0     | —        |
| Moderate | 0     | —        |
| Low      | 2     | `tmp`    |

---

### Low: `tmp` — Arbitrary temp file/directory write via symlink (GHSA-52f5-9888-hmc6)

- **Vulnerable versions:** `<=0.2.3`
- **Patched versions:** `>=0.2.4`
- **Dependency paths:**
  - `.>@lhci/cli>inquirer>external-editor>tmp`
  - `.>@lhci/cli>tmp`
- **CVE:** CVE-2025-54798
- **CVSS:** 2.5 (CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N)

**Rationale for acceptance (FLAGGED):**  
Introduced via `@lhci/cli@0.15.1` (dev dependency). This is a low-severity symlink-race issue in a temp-file utility used only during local Lighthouse CI runs. No production impact. **Flagged for Adrian** — can be resolved by upgrading `@lhci/cli` to a version that pulls `tmp>=0.2.4`, or adding a pnpm override for `tmp`.

---

## Actions Taken in This Run

1. **Verified auth-touching dependencies are pinned to exact versions in `package.json`:**
   - `discord.js`: `14.26.4` (already exact)
   - `@anthropic-ai/sdk`: `0.92.0` (already exact)

2. **Verified `pnpm audit --audit-level moderate` is present in CI** (`.github/workflows/quality.yml`) so the build fails on any critical or moderate CVEs going forward.

3. **Confirmed previously flagged moderate findings are resolved via `pnpm.overrides`:**
   - `uuid` override to `14.0.0` resolves GHSA-w5hq-g745-h8pq.
   - `postcss` override to `8.5.10` resolves GHSA-qx2v-qp2m-jg93 / CVE-2026-41305.

4. **Documented all current findings** with severity, dependency paths, CVE identifiers, and acceptance rationale.

---

## Remaining Open Items (Flagged for Adrian)

- [ ] `@lhci/cli` transitive dependency `tmp` — low CVE (2 paths, CVE-2025-54798)

---

## Historical Entries

### 2026-05-02 — Baseline Audit

See earlier version of this log for the original baseline entry documenting `uuid` and `postcss` moderate findings (now resolved via overrides) and the initial `tmp` low finding.

---

## Cadence

- **Dependency audit:** Repeat monthly or after any bulk dependency upgrade.
- **Secrets scan:** Pre-commit on every commit (when gitleaks is installed). CI (`.github/workflows/secret-scan.yml`) on every PR and push to `main`. Full-history scan quarterly or after any suspected exposure: [Run workflow](https://github.com/hirobius/ops/actions/workflows/secret-scan.yml) on `main`.
- **Key rotation:** Quarterly for active API tokens; annually or on-exposure for npm publish token.

Update this log with new entries; do not overwrite history.
