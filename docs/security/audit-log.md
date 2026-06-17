# Dependency Audit Log

**Repository:** @hirobius/design-system  
**Audit tool:** pnpm audit  
**Last run:** 2026-05-03  
**Runner:** 13s-1-dependency-hygiene

---

## 2026-05-03 — Secrets Audit

Command: `gitleaks detect --source . --log-opts="--all" --config .gitleaks.toml`

### Findings Summary

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 0 | No exposed secrets detected |
| High     | 0 | — |
| Moderate | 0 | — |
| Low      | 0 | 115 historical false positives (design-token paths) now allowlisted |

### Actions Taken

1. **Installed `.gitleaks.toml`** with HDS-specific allowlists for design-token paths (`primitive.radius.*`, `primitive.size.*`, etc.) that were falsely matched by the generic API-key rule in `component-api.json` and `shape.json`.
2. **Added `gitleaks detect --staged` to `.husky/pre-commit`** so every commit is scanned before push.
3. **Verified `.env*` is in `.gitignore`** — already present.
4. **No keys required rotation** — all 115 findings were confirmed false positives; no actual secrets were exposed.

### Key Rotation Schedule

| Vendor / Service | Rotation Cadence | Last Rotated | Next Due | Owner |
|------------------|------------------|--------------|----------|-------|
| GitHub Personal Access Token | Quarterly | 2026-04-01 | 2026-07-01 | Adrian |
| Vercel Token | Quarterly | 2026-04-01 | 2026-07-01 | Adrian |
| Anthropic API Key | Quarterly | 2026-04-01 | 2026-07-01 | Adrian |
| Discord Bot Token | Quarterly | 2026-04-01 | 2026-07-01 | Adrian |
| npm publish token | On exposure or annually | 2026-04-01 | 2027-04-01 | Adrian |

**Procedure:** Rotate via vendor dashboard → update local `.env` → revoke old token immediately → record new last-rotated date in this log.

---

## 2026-05-03 — Dependency Hygiene

Command: `pnpm audit`

### Findings Summary

| Severity | Count | Packages |
|----------|-------|----------|
| Critical | 0 | — |
| High     | 0 | — |
| Moderate | 0 | — |
| Low      | 2 | `tmp` |

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
- **Secrets scan:** Run via pre-commit on every commit; full-history scan quarterly or after any suspected exposure.
- **Key rotation:** Quarterly for active API tokens; annually or on-exposure for npm publish token.

Update this log with new entries; do not overwrite history.
