# Security Pass Audit — 2026-05-02

Unit: `10o-8-security-pass` | Phase: `10-O-ops-hygiene` | Session: `session:fresh-2026-05-02-w2-a3`

## Summary

Triage pass covering secrets handling, dependency hygiene, workflow permissions,
local sync scripts, and automation boundaries.

---

## 1. pnpm audit (validationCmd)

```
pnpm audit --audit-level=high
```

**Result:** 0 high-severity vulnerabilities. 2 low + 2 moderate present; below threshold.

---

## 2. .gitignore Coverage

**Status: PASS**

The following sensitive paths are correctly ignored:

| Pattern | Notes |
|---------|-------|
| `.env`, `.env.*` | Runtime secrets; `.env.example` is explicitly un-ignored (safe) |
| `*.key`, `*.pem` | Private key files |
| `telemetry/events.jsonl`, `telemetry/test-events.jsonl` | Runtime telemetry data |
| `.claude/worktrees/` | Per-session Claude Code sandboxes |
| `tokens-from-figma.json` | Reverse-sync output (contains Figma snapshot, not credentials) |
| `.vercel` | Vercel deploy config |

Verified with `git check-ignore` and `git ls-files`: none of the above are tracked.

---

## 3. Bridge Credentials (HDS_BRIDGE_SECRET)

**Status: PASS**

- `scripts/hds-bridge.mjs:88-92`: `HDS_BRIDGE_SECRET` loaded from `process.env` only.
- If `authEnabled=true` and the secret is unset, the bridge refuses to start:
  `[hds-bridge] FATAL: authEnabled=true in bridge.config.json but HDS_BRIDGE_SECRET is unset`.
- No hardcoded default secret anywhere in the codebase.
- `scripts/auth-middleware.mjs`: HMAC verification middleware — clean implementation
  with no fallback to a weaker or default secret.

---

## 4. Workflow Permissions

**Status: LOW FINDING — no action required immediately**

None of the 10 GitHub workflows have explicit `permissions:` blocks. By default, GitHub
Actions grants `write` on `contents` and `pull-requests` for `GITHUB_TOKEN`. 
Two workflows use GITHUB_TOKEN:

- `llm-daily-synthetic.yml`: creates issues on failure — requires `issues: write`.
- `strengths-audit.yml`: creates issues on drift — requires `issues: write`.

**Recommendation (non-blocking):** Add `permissions: { issues: write }` to both workflows
to follow least-privilege. This is a hardening enhancement, not a current vulnerability.

The Figma-sync workflow uses repository secrets (`FIGMA_PERSONAL_ACCESS_TOKEN`,
`FIGMA_FILE_KEY`) — these are GitHub-encrypted secrets, not committed to source. PASS.

---

## 5. External Process Spawning

**Status: PASS**

Scripts that spawn child processes:
- `scripts/check-route-smoke.mjs`: spawns `vite preview` on localhost. Input is
  hardcoded command-line constants, no user-supplied shell injection surface.
- `scripts/self-heal.mjs`: spawns `vite` on localhost. Same pattern — no injection.
- `scripts/orchestration-watcher.mjs`, `scripts/build-roadmap-data.mjs`: use `execSync`
  with static git commands. No user input interpolated into shell strings.

---

## 6. Client-Side Password Gate

**Status: LOW FINDING — documented, not a production secret**

`src/app/pages/WetPaintPage.tsx:336`:
```ts
const requiredPassword = import.meta.env.VITE_PREVIEW_PASSWORD || 'hirobius';
```

The fallback password `'hirobius'` is visible in the compiled JS bundle. This is a
preview/staging gate for a portfolio site, not a production authentication mechanism.
The password is not a backend secret and does not gate any data or API.

**Recommendation:** Set `VITE_PREVIEW_PASSWORD` via environment variable in production
Vercel deploys to avoid relying on the default. The hardcoded string is intentional and
low-risk for a portfolio preview gate, but environment-scoped would be cleaner.

---

## 7. Secrets in Source / docs

**Status: PASS**

`node scripts/check-security-baseline.mjs` passed with no violations:
> ✓ Security baseline check passed — no committed secrets, blocked env files, unsafe injection, or external font drift detected.

Manual grep confirmed: no Figma tokens, API keys, or bearer tokens in source or docs.

---

## 8. dangerouslySetInnerHTML Usage

**Status: PASS — single exempted instance**

One usage in `src/app/components/DocPageSpec.tsx:71`:
```tsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
// security-ok: JSON.stringify output — no user input, no raw HTML
```

JSON-LD structured data injection via `JSON.stringify` is safe. No raw HTML or
user input involved. Exemption comment is present.

---

## 9. Telemetry / bridge.config.json

**Status: PASS**

- `bridge.config.json` is tracked in git — it contains only feature flags (no secrets).
- `telemetry/logger.mjs` is tracked — source code only, no event data.
- Event log files (`events.jsonl`, `test-events.jsonl`) are gitignored.

---

## Findings Summary

| Check | Status |
|-------|--------|
| pnpm audit --audit-level=high | PASS (0 high/critical) |
| .gitignore coverage | PASS |
| Bridge credentials | PASS |
| Workflow permissions | LOW (no action required) |
| Process spawning | PASS |
| Client-side password fallback | LOW (documented, acceptable) |
| Secrets in source | PASS |
| dangerouslySetInnerHTML | PASS |
| Telemetry isolation | PASS |

**No high-severity issues found. No breaking dependency upgrades required.**
