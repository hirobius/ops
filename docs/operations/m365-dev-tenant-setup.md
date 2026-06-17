---
title: Microsoft 365 — Setup for Email-Triage Live Test (Lilac tenant)
audience: Adrian (operator)
client: lilac-insure (test surface; reusable for any client)
lastUpdated: 2026-05-06
---

# M365 Setup Runbook — Lilac Tenant Path

**Goal:** stand up Microsoft Graph access against Lilac Insurance Group's real
M365 tenant, scoped narrowly to `administration@lilacinsure.com` as the test
surface, so we can run `email-triage` end-to-end without touching Conrad's
personal mailbox until we're ready.

Time: ~25 minutes for first-time setup (most of it click-through in the Azure
portal).

This runbook is reusable for every future Outlook-using client — the same
pattern works against any tenant the operator has admin access to.

---

## Why this changed (2026-05-06)

The previous version of this runbook used the Microsoft 365 Developer Program
sandbox as the test surface. As of 2024-2025, Microsoft has restricted that
program to accounts with an active Visual Studio Professional or Enterprise
subscription. Signing in at `developer.microsoft.com/en-us/microsoft-365/dev-program`
now returns:

> You don't currently qualify for a Microsoft 365 Developer Program sandbox subscription.

The replacement path uses the **customer's own tenant** (Lilac's), with the
shared `administration@lilacinsure.com` mailbox as the test surface. That
mailbox is the agency's operational ops/admin inbox; it does not contain
client PII (Conrad's personal `cmilsap@` mailbox is where customer data
lives). An Exchange Application Access Policy then scopes the registered
Azure AD app so it can only read **that one mailbox** even though Graph
Application Permissions technically grant tenant-wide reach. That's the
security guardrail this runbook adds in Step 3c.

When we flip the test surface from `administration@` to Conrad's mailbox
later, the only change is one env variable (`MS_GRAPH_TEST_MAILBOX`) and one
line in the Application Access Policy. No code change, no re-registration.

---

## Prerequisites

Before starting, confirm:

- **You can sign in to Lilac's tenant.** Adrian uses `administration@lilacinsure.com`.
- **That account has admin rights.** Specifically you need one of:
  - Global Administrator (full power; most likely on a 1-person agency tenant)
  - Application Administrator + Exchange Administrator combined
  - Cloud Application Administrator + Exchange Administrator combined
  - Enough privilege to register apps, grant admin consent, and run
    `New-ApplicationAccessPolicy` in Exchange Online.
- **Test:** open `portal.azure.com` while signed in as `administration@`. If
  you can navigate to **Microsoft Entra ID → App registrations → New
  registration** without a permission error, you're good.

If `administration@` is not the global admin, find out which mailbox is — that
account needs to be the one running the steps below, OR Conrad needs to grant
the missing role to `administration@` first.

---

## Step 1 — Identify the test mailbox

We use `administration@lilacinsure.com` as the test surface. Confirm it
exists and is reachable:

1. Sign in at https://outlook.office.com as `administration@lilacinsure.com`.
2. Confirm the inbox loads. Note any existing categories (so the `lilac-*`
   tags we add later don't collide).

That's it. No new mailbox to create — we're using what's already there.

---

## Step 2 — Register an Azure AD app in Lilac's tenant

1. Go to https://portal.azure.com (signed in as `administration@lilacinsure.com`).
2. Navigate to **Microsoft Entra ID → App registrations → New registration**.
3. Name: `Lilac Email Triage`.
4. Supported account types: **Accounts in this organizational directory only**
   (single tenant — Lilac only).
5. Redirect URI: leave blank.
6. Click **Register**.
7. On the app's **Overview** page, copy:
   - **Application (client) ID** → this is `MS_GRAPH_CLIENT_ID`
   - **Directory (tenant) ID** → this is `MS_GRAPH_TENANT_ID`

### Step 2a — Generate a client secret

1. App → **Certificates & secrets** → **New client secret**.
2. Description: `email-triage-administration`. Expires: 6 months (rotate
   before expiry — set a calendar reminder).
3. Click **Add**. **Copy the `Value` field NOW** — Azure will not show it
   again. If you miss it, delete and recreate.
4. This value is `MS_GRAPH_CLIENT_SECRET`.

### Step 2b — Grant API permissions

1. App → **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Application permissions** (NOT delegated — we want app-only auth).
2. Add:
   - `Mail.Read` — read messages
   - `Mail.ReadWrite` — read + apply category tags
3. Click **Add permissions**.
4. Click **Grant admin consent for `Lilac Insurance Group`**. Status should
   change to green ✓ for both.

### Step 2c — Scope the app to a single mailbox (CRITICAL — security guard)

`Mail.Read` and `Mail.ReadWrite` Application Permissions grant the app access
to **every mailbox in Lilac's tenant**. We do not want that. An Exchange
Online **Application Access Policy** restricts the app's reach to a specific
mailbox or distribution group — the standard Microsoft pattern for scoping
app-only auth.

This step is mandatory before Step 4 (`--auth-check`) — do not skip it.

#### One-time prep: install the Exchange Online PowerShell module

On any Windows machine (or WSL with PowerShell Core):

```powershell
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser
```

#### Apply the policy

```powershell
# Sign in to Exchange Online as administration@lilacinsure.com
Connect-ExchangeOnline -UserPrincipalName administration@lilacinsure.com

# Create the access policy. Replace <CLIENT-ID> with MS_GRAPH_CLIENT_ID from Step 2.
New-ApplicationAccessPolicy `
  -AppId <CLIENT-ID> `
  -PolicyScopeGroupId administration@lilacinsure.com `
  -AccessRight RestrictAccess `
  -Description "Lilac Email Triage — restrict to administration mailbox only"

# Verify
Test-ApplicationAccessPolicy -Identity administration@lilacinsure.com -AppId <CLIENT-ID>
# Expected: AccessCheckResult : Granted
Test-ApplicationAccessPolicy -Identity cmilsap@lilacinsure.com -AppId <CLIENT-ID>
# Expected: AccessCheckResult : Denied
```

If `Granted` shows for `administration@` and `Denied` shows for any other
mailbox you test, the scope is correct. The app cannot reach mailboxes
outside the policy even though its Graph permissions technically allow it.

#### Future: flipping to Conrad's mailbox

When we're ready to move from test to production against Conrad's mailbox,
update the policy:

```powershell
Set-ApplicationAccessPolicy `
  -Identity "<existing-policy-id>" `
  -PolicyScopeGroupId cmilsap@lilacinsure.com
```

…and change `MS_GRAPH_TEST_MAILBOX` in `.env.local`. No code change, no
re-registration.

---

## Step 3 — Add env keys to `.env.local`

Open your local `.env.local` (you handle this — Claude does not touch `.env*`).
Add:

```bash
# Microsoft Graph — Lilac email-triage (Lilac M365 tenant, administration@ surface)
MS_GRAPH_TENANT_ID=<paste from Step 2>
MS_GRAPH_CLIENT_ID=<paste from Step 2>
MS_GRAPH_CLIENT_SECRET=<paste from Step 2a>
MS_GRAPH_TEST_MAILBOX=administration@lilacinsure.com
```

The variable name `MS_GRAPH_TEST_MAILBOX` is historical — it now means
"whichever mailbox the app is scoped to right now," not specifically a
sandbox mailbox.

---

## Step 4 — Smoke-test the auth

```bash
node clients/lilac-insure/automations/email-triage/live-graph.mjs --auth-check
```

Expected: HTTP 200 from token endpoint, prints `auth ok — token TTL ~60min`.

Diagnostics:
- **400 `invalid_client`** → wrong client secret. Regenerate via Step 2a, rotate.
- **401** → admin consent not granted (Step 2b) or wrong tenant ID.
- **403 on subsequent message reads** → `Mail.Read` permission missing OR
  Application Access Policy is rejecting access to the requested mailbox.
  Re-run `Test-ApplicationAccessPolicy` from Step 2c to verify scope.
- **`Access is denied. Check credentials and try again.`** on
  `/users/{mailbox}/messages` → Application Access Policy denied. Either
  the policy points at a different mailbox or Exchange hasn't propagated
  the policy yet (wait 1–2 minutes after `New-ApplicationAccessPolicy` and
  retry).

---

## Step 5 — Send the 12 test emails

Open `clients/lilac-insure/automations/email-triage/test-emails.md`. It has 12
copy-paste-ready emails (one per category). Send each to
`administration@lilacinsure.com` from any sender (your personal Gmail works —
vary the `From` address per the guidance in the doc to exercise the
`from-pattern` rules).

---

## Step 6 — Run the live classifier

```bash
# Read mode (no mutation): fetch latest 20 unread, classify each, print results
node clients/lilac-insure/automations/email-triage/live-graph.mjs --read

# Apply mode: same, but PATCH categories on each message (visible in Outlook UI)
node clients/lilac-insure/automations/email-triage/live-graph.mjs --apply
```

Outlook → categories show up as `lilac-<id>` (`lilac-lead`, `lilac-claim`,
etc.). Right-click any email in Outlook to confirm.

For full-mailbox aggregate stats:

```bash
node clients/lilac-insure/automations/email-triage/live-graph.mjs --sweep
```

Writes a privacy-safe report (no message bodies) to
`clients/lilac-insure/inbox-discovery-results/sweep-<ISO-ts>.json`.

---

## Cleanup / hygiene

- **Rotate the client secret** before its expiry date. Set a calendar reminder
  for ~5 days before the date you picked in Step 2a.
- **Delete the registered app** when the engagement ends: Entra ID → App
  registrations → `Lilac Email Triage` → Delete. This also removes the
  Application Access Policy automatically once the AppId no longer exists.
- **Audit access** quarterly: re-run `Test-ApplicationAccessPolicy` for both
  `administration@` (should be `Granted`) and `cmilsap@` (should be `Denied`
  until intentionally promoted).
- **If the secret is exposed** at any point: rotate immediately via Step 2a,
  then update `.env.local`.

---

## What this unlocks

Once auth works end-to-end against `administration@`:

- **`email-triage` live test** — classify real Graph payloads (not just fixtures),
  validate the 15/15 classifier holds against actual Outlook structure.
- **`auto-responder` live test** — once we add `Mail.Send` Application
  Permission (same Step 2b pattern), the auto-responder can send via
  `administration@` in test mode.
- **Inbox discovery report (Phase 2 pro bono `pb-1`)** — once we flip the
  Application Access Policy to Conrad's mailbox, Pattern A discovery runs
  against his real inbox with one env change.
- **Future M365 clients** — same playbook: register an app in their tenant,
  scope to one mailbox via Application Access Policy, run.

Keep this runbook as the canonical M365 setup for Hirobius.
