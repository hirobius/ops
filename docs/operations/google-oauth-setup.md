---
status: pending
priority: high
blockedBy: Adrian (must complete manually — browser-based OAuth flow)
---

# Google OAuth Setup — Gmail + Drive

Enables two scripts:
- `scripts/sync-client-emails.mjs` — Gmail thread parsing
- `scripts/process-call-recording.mjs` — Download + transcribe call recording ZIPs from Drive

---

## Env vars needed in `.env.local`

```
GMAIL_CLIENT_ID=
GMAIL_CLIENT_SECRET=
GMAIL_REFRESH_TOKEN=
OPENAI_API_KEY=
```

---

## Steps

### 1. Enable APIs in Google Cloud Console

Project to use: `youtube-breakdowns-489817` (already exists)

Enable both of these:
- https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=youtube-breakdowns-489817
- https://console.cloud.google.com/apis/library/drive.googleapis.com?project=youtube-breakdowns-489817

### 2. Create OAuth 2.0 credentials

Go to: https://console.cloud.google.com/apis/credentials?project=youtube-breakdowns-489817

- **Create Credentials → OAuth 2.0 Client ID**
- Application type: **Desktop app**
- Name: `Hirobius Scripts`
- Copy the **Client ID** and **Client Secret**
- Add both to `.env.local`:
  ```
  GMAIL_CLIENT_ID=<client id>
  GMAIL_CLIENT_SECRET=<client secret>
  ```

### 3. Generate the refresh token

Run this from the project root (the `!` prefix runs it in-session):
```
! node scripts/google-auth.mjs
```

- Opens a browser auth URL — sign in with the Google account that owns the Drive recordings and Gmail
- Click **Allow**
- Terminal prints: `GMAIL_REFRESH_TOKEN=1//0g...`
- Add that value to `.env.local`

The token covers both Gmail (read) and Drive (read) — one token for both scripts.

> If it says "no refresh_token returned": go to https://myaccount.google.com/permissions,
> revoke the app, then re-run.

### 4. Get a Groq API key (free — recommended)

- https://console.groq.com → API Keys → **Create API Key**
- No credit card required. Free tier: 20 hours of audio/day.
- Add to `.env.local`:
  ```
  GROQ_API_KEY=gsk_...
  ```
- The script auto-detects Groq when `GROQ_API_KEY` is set — no extra flags needed.

> OpenAI Whisper also works (`OPENAI_API_KEY`) if you already have a key, but Groq is free and just as fast.

---

## Verify it works

```bash
# Dry-run the prospect recording (downloads + extracts, no transcription spend)
! node scripts/process-call-recording.mjs 1dNxov4T1BnawFKaKBz6OvjS3pgpiUpDL --client prospect-001 --dry-run

# Full transcription run
! node scripts/process-call-recording.mjs 1dNxov4T1BnawFKaKBz6OvjS3pgpiUpDL --client prospect-001

# Point at a whole folder (processes all ZIPs)
! node scripts/process-call-recording.mjs <folder-id> --client prospect-001
```

Transcripts land in `clients/<slug>/recordings/<date>-<name>.md`.

---

## Notes

- Do NOT use `gmailmcp.googleapis.com` — that's the Claude MCP server's internal API, not what we need
- The same refresh token replaces any previous Gmail-only token — update `.env.local` in place
- `scripts/google-auth.mjs` is the one-time setup script; don't re-run it unless you're rotating credentials
