# Vendor Risk Register

> **Document type:** Live risk register  
> **Last updated:** 2026-05-03  
> **Scope:** Third-party vendors that process HDS repository data, build artifacts, or communications.  
> **Sources:** Vendor-published security and privacy pages only — no speculation.

---

## Risk Rating Key

| Rating | Definition |
|--------|------------|
| 🟢 Low | Published security posture, clear data handling, known residency. |
| 🟡 Medium | Published posture, but one or more obligations (e.g. breach SLA) are not publicly documented. |
| 🔴 High | Significant compliance gaps, opaque data handling, or jurisdictional risks. |

---

## 1. Anthropic

**Risk rating:** 🟡 Medium

| Attribute | Detail |
|-----------|--------|
| **Data touched** | API prompts, model outputs, token usage metadata, account credentials (for API access), support tickets. |
| **Data residency** | US-based (AWS `us-east-1`, `us-west-2`). Enterprise customers may request residency controls via custom agreement. |
| **Retention policy** | API customer data is not used to train models by default. Anthropic retains API traffic for **30 days** for abuse monitoring and service improvement, after which it is deleted unless a longer retention is agreed in an Enterprise contract. |
| **Breach notification SLA** | **Not published.** Anthropic describes its security program and incident-response process on its Trust Center, but no public SLA committing to a specific customer-notification timeframe (e.g. "within 72 hours") is available. |
| **Security / privacy links** | <https://www.anthropic.com/security> • <https://www.anthropic.com/privacy> • <https://trust.anthropic.com> |

**Risk item:** `RISK-001` — No published breach-notification SLA. Contractual notification terms must be verified in any Enterprise Agreement or DPA before production reliance.

---

## 2. Vercel

**Risk rating:** 🟡 Medium

| Attribute | Detail |
|-----------|--------|
| **Data touched** | Source code (Git integration), build logs, deployment artifacts, traffic logs, analytics events, DNS records, team membership data, payment information. |
| **Data residency** | Default infrastructure is global (Edge Network) with origin processing primarily in the **United States**. Enterprise plans offer a **Data Residency** add-on for EU and other regions. |
| **Retention policy** | Build logs: **30 days** (Hobby), **90 days** (Pro), longer for Enterprise. Analytics: **30 days** (Hobby/Pro), **12 months** (Enterprise). Artifacts persist until the deployment is deleted or replaced. |
| **Breach notification SLA** | **Not published.** Vercel maintains a Trust portal and publishes SOC 2 Type II and ISO 27001 reports, but a public customer-notification SLA for security incidents is not stated on its published security or privacy pages. |
| **Security / privacy links** | <https://vercel.com/security> • <https://vercel.com/legal/privacy-policy> • <https://vercel.com/trust> |

**Risk item:** `RISK-003` — No published breach-notification SLA. Verify notification terms in the signed Business Associate Agreement (BAA) / Data Processing Addendum (DPA) if applicable.

---

## 3. Discord

**Risk rating:** 🟡 Medium

| Attribute | Detail |
|-----------|--------|
| **Data touched** | Messages, voice/video data (transient), file attachments, account metadata, integration/webhook payloads (including any bot or webhook traffic directed to Discord channels), IP addresses, device information. |
| **Data residency** | Primarily **United States**. Discord may use global CDN and edge locations for content delivery; core data storage is US-based. |
| **Retention policy** | Messages and content are retained until the user or server owner deletes them; some data is retained for longer periods to comply with legal obligations or for safety/security purposes. Detailed retention periods are listed in the Privacy Policy. |
| **Breach notification SLA** | **Not published.** Discord operates a security program and bug-bounty program (see Security page), but a public SLA committing to a specific customer-notification timeframe after a breach is not published. |
| **Security / privacy links** | <https://discord.com/security> • <https://discord.com/privacy> |

**Risk item:** `RISK-004` — No published breach-notification SLA. Do not share confidential design-system tokens, secrets, or PII in Discord messages or webhooks.

---

## 4. GitHub

**Risk rating:** 🟡 Medium

| Attribute | Detail |
|-----------|--------|
| **Data touched** | Source code, Git history, Issues, Pull Requests, Actions workflow logs and artifacts, Secrets (encrypted), repository metadata, team/organization membership, SAML/SCIM assertions (Enterprise). |
| **Data residency** | Global infrastructure; primary storage is **United States**. GitHub Enterprise Cloud offers data residency options for Enterprise Managed Users and select regions. |
| **Retention policy** | Repositories and metadata: retained until deleted by the user/organization. Actions logs and artifacts: **90 days** default retention (configurable). Git history is immutable unless rewritten. Backups are retained for disaster-recovery windows documented in SOC 2 reports. |
| **Breach notification SLA** | **Not published.** GitHub’s Privacy Statement states that users will be notified of breaches "where we are legally required to do so," but a standalone, public SLA with a fixed notification timeframe (e.g. "within 72 hours") is not published on its security or privacy pages. |
| **Security / privacy links** | <https://github.com/security> • <https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement> • <https://github.com/security/advisories> |

**Risk item:** `RISK-005` — No published breach-notification SLA. Enterprise customers should verify notification commitments in their GitHub Enterprise Agreement or DPA.

---

## Summary Matrix

| Vendor | Jurisdiction | Breach SLA Published? | Risk ID |
|--------|--------------|----------------------|---------|
| Anthropic | US | ❌ No | RISK-001 |
| Vercel | US (global edge) | ❌ No | RISK-003 |
| Discord | US | ❌ No | RISK-004 |
| GitHub | US (global) | ❌ No | RISK-005 |

---

## Action Items

1. **Contract review:** For any vendor used in production workflows, obtain and file the signed DPA / BAA to confirm breach-notification terms that are not publicly stated.
2. **Secrets hygiene:** Do not share `HDS_BRIDGE_SECRET`, Figma tokens, or preview passwords in Discord, GitHub Issues, or any third-party channel.
3. **Quarterly refresh:** Re-check published security pages for updated SLA commitments; update this register accordingly.

---

*This document is factual and dated. All claims are sourced from vendor-published pages as of the last-updated date. No forward-looking or speculative statements are included.*
