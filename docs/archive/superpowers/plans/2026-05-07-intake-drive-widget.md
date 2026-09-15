# Intake Widget — Google Drive + Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone intake widget deployed to Vercel that uploads files + URLs directly to a flat Google Drive folder from the browser, accessible from any device including mobile.

**Architecture:** A minimal Vite + React app in `tools/intake/`. Google Identity Services (via `@react-oauth/google`) handles OAuth in the browser — no backend, no server-side credentials. Files upload directly to the Drive REST API using the OAuth access token. A manifest JSON file is created per batch recording note + URLs + file IDs. Two env vars: `VITE_GOOGLE_CLIENT_ID` (from Google Cloud Console) and `VITE_DRIVE_FOLDER_ID` (the ID of the flat intake folder in Drive). Deployed as a separate Vercel project.

**Tech Stack:** React 18, Vite, TypeScript, react-dropzone, @react-oauth/google, Google Drive REST API (fetch — no googleapis package), Vercel

---

## Prerequisites (manual, one-time — do before running any tasks)

### A. Create Google Cloud project + OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project — name it `hirobius-intake`
3. **APIs & Services → Library** → search `Google Drive API` → Enable it
4. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: `Hirobius Intake`
   - Support email: `adrian@hirobius.com`
   - Scopes: add `https://www.googleapis.com/auth/drive.file`
   - Test users: add `adrian@hirobius.com`
   - Save and continue through all screens
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: Web application
   - Name: `intake-widget`
   - Authorized JavaScript origins: add `http://localhost:5174` (dev) — add your Vercel URL after deploy
   - Authorized redirect URIs: same two URLs
   - Click Create → **copy the Client ID** (looks like `123456789-abc.apps.googleusercontent.com`)

### B. Create the intake folder in Google Drive

1. Open [drive.google.com](https://drive.google.com)
2. Create a folder named `Intake` (anywhere in your Drive — top-level is fine)
3. Open the folder — **copy the folder ID from the URL**: `https://drive.google.com/drive/folders/`**`THIS_PART`**

### C. Create a `.env.local` file in `tools/intake/` (after Task 1 scaffolds the directory)

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_DRIVE_FOLDER_ID=your-folder-id-from-drive-url
```

---

## File Map

| Action | Path                          | Purpose                                    |
| ------ | ----------------------------- | ------------------------------------------ |
| Create | `tools/intake/package.json`   | App deps + scripts                         |
| Create | `tools/intake/vite.config.ts` | Vite config, port 5174                     |
| Create | `tools/intake/tsconfig.json`  | TS config                                  |
| Create | `tools/intake/index.html`     | Entry HTML                                 |
| Create | `tools/intake/src/main.tsx`   | React root                                 |
| Create | `tools/intake/src/App.tsx`    | Full intake UI + Drive upload logic        |
| Create | `tools/intake/vercel.json`    | Vercel deployment config                   |
| Create | `tools/intake/.gitignore`     | Ignore node_modules + .env.local           |
| Modify | `tools/intake/src/App.tsx`    | (single file for all logic — small enough) |

---

### Task 1: Scaffold the tools/intake app

**Files:**

- Create: `tools/intake/package.json`
- Create: `tools/intake/vite.config.ts`
- Create: `tools/intake/tsconfig.json`
- Create: `tools/intake/index.html`
- Create: `tools/intake/src/main.tsx`
- Create: `tools/intake/.gitignore`

- [ ] **Step 1: Create package.json**

Create `tools/intake/package.json`:

```json
{
  "name": "@hirobius/intake",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 5174"
  },
  "dependencies": {
    "@react-oauth/google": "^0.12.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-dropzone": "^15.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.4.5",
    "vite": "^5.3.1"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

Create `tools/intake/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
```

- [ ] **Step 3: Create tsconfig.json**

Create `tools/intake/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create index.html**

Create `tools/intake/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Hirobius Intake</title>
    <style>
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #0f0f0f;
        color: #e8e8e8;
        min-height: 100dvh;
        padding: 16px;
      }
      #root {
        max-width: 540px;
        margin: 0 auto;
        padding-top: 32px;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.tsx**

```bash
mkdir -p tools/intake/src
```

Create `tools/intake/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);
```

- [ ] **Step 6: Create .gitignore**

Create `tools/intake/.gitignore`:

```
node_modules/
dist/
.env.local
.env*.local
```

- [ ] **Step 7: Install dependencies**

```bash
cd tools/intake && pnpm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 8: Commit**

```bash
git add tools/intake/
git commit -m "chore(intake): scaffold tools/intake Vite app"
```

---

### Task 2: Build App.tsx — auth, upload logic, and UI

**Files:**

- Create: `tools/intake/src/App.tsx`

Everything lives in one file: Google OAuth state, Drive upload function, dropzone, URL input, note field, queue display, submit. The `drive.file` scope means the app can only see files it created — no access to the rest of Drive.

- [ ] **Step 1: Create App.tsx**

Create `tools/intake/src/App.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { useDropzone } from 'react-dropzone';

// ── Config ──────────────────────────────────────────────────────────────────

const FOLDER_ID = import.meta.env.VITE_DRIVE_FOLDER_ID as string;

const ACCEPT = {
  'audio/*': ['.mp3', '.m4a', '.wav', '.webm', '.ogg'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  'image/svg+xml': ['.svg'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt', '.md', '.csv', '.yaml', '.yml'],
  'text/html': ['.html'],
  'application/json': ['.json'],
  'text/javascript': ['.js', '.mjs', '.ts', '.tsx', '.css', '.scss'],
  'application/octet-stream': [
    '.obj',
    '.stl',
    '.3mf',
    '.glb',
    '.gltf',
    '.blend',
    '.gcode',
    '.eps',
    '.ai',
    '.dxf',
  ],
};

const EXT_GROUP: Record<string, string> = {
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  webm: 'audio',
  ogg: 'audio',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'vector',
  eps: 'vector',
  ai: 'vector',
  dxf: 'vector',
  pdf: 'document',
  txt: 'document',
  md: 'document',
  html: 'bookmarks',
  js: 'code',
  mjs: 'code',
  ts: 'code',
  tsx: 'code',
  css: 'code',
  scss: 'code',
  json: 'data',
  yaml: 'data',
  yml: 'data',
  csv: 'data',
  obj: '3d',
  stl: '3d',
  '3mf': '3d',
  glb: '3d',
  gltf: '3d',
  blend: '3d',
  gcode: '3d',
};

function typeGroup(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_GROUP[ext] ?? 'other';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// ── Drive API ────────────────────────────────────────────────────────────────

async function uploadFileToDrive(file: File, folderId: string, token: string): Promise<string> {
  const metadata = { name: file.name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function createManifestInDrive(
  manifest: object,
  folderId: string,
  token: string,
): Promise<void> {
  const name = `intake-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const metadata = { name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Manifest write failed: ${res.status}`);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface QueuedFile {
  kind: 'file';
  id: string;
  file: File;
  group: string;
}
interface QueuedUrl {
  kind: 'url';
  id: string;
  url: string;
}
type QueuedItem = QueuedFile | QueuedUrl;

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting'; done: number; total: number }
  | { kind: 'done'; count: number }
  | { kind: 'error'; message: string };

let seq = 0;
const uid = () => String(++seq);

// ── Component ────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [note, setNote] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const login = useGoogleLogin({
    onSuccess: (res) => setToken(res.access_token),
    onError: () => setSubmitState({ kind: 'error', message: 'Google sign-in failed' }),
    scope: 'https://www.googleapis.com/auth/drive.file',
  });

  const logout = useCallback(() => {
    googleLogout();
    setToken(null);
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    setQueue((prev) => [
      ...prev,
      ...accepted.map((f) => ({
        kind: 'file' as const,
        id: uid(),
        file: f,
        group: typeGroup(f.name),
      })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
  });

  const addUrls = useCallback(() => {
    const lines = urlInput
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setQueue((prev) => [
      ...prev,
      ...lines.map((url) => ({ kind: 'url' as const, id: uid(), url })),
    ]);
    setUrlInput('');
  }, [urlInput]);

  const removeItem = (id: string) => setQueue((prev) => prev.filter((i) => i.id !== id));

  const handleSubmit = useCallback(async () => {
    if (!token || !queue.length) return;
    const files = queue.filter((i): i is QueuedFile => i.kind === 'file');
    const urls = queue.filter((i): i is QueuedUrl => i.kind === 'url');
    const total = files.length + 1; // +1 for manifest

    setSubmitState({ kind: 'submitting', done: 0, total });

    try {
      const uploadedFiles: { name: string; driveId: string }[] = [];

      for (const item of files) {
        const driveId = await uploadFileToDrive(item.file, FOLDER_ID, token);
        uploadedFiles.push({ name: item.file.name, driveId });
        setSubmitState((prev) =>
          prev.kind === 'submitting' ? { ...prev, done: prev.done + 1 } : prev,
        );
      }

      await createManifestInDrive(
        {
          receivedAt: new Date().toISOString(),
          note,
          urls: urls.map((u) => u.url),
          files: uploadedFiles,
        },
        FOLDER_ID,
        token,
      );

      setSubmitState({ kind: 'done', count: files.length + urls.length });
      setQueue([]);
      setNote('');
    } catch (err) {
      setSubmitState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [token, queue, note]);

  const reset = () => setSubmitState({ kind: 'idle' });
  const fileCount = queue.filter((i) => i.kind === 'file').length;
  const urlCount = queue.filter((i) => i.kind === 'url').length;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.title}>Intake</span>
        {token ? (
          <button onClick={logout} style={s.authBtn}>
            sign out
          </button>
        ) : (
          <button onClick={() => login()} style={s.authBtn}>
            sign in with Google
          </button>
        )}
      </div>

      {!token && <p style={s.authHint}>Sign in to upload files to Google Drive.</p>}

      {token && (
        <>
          {/* Drop zone */}
          <div
            {...getRootProps()}
            style={{ ...s.dropzone, ...(isDragActive ? s.dropzoneActive : {}) }}
          >
            <input {...getInputProps()} />
            <span style={s.dropHint}>
              {isDragActive ? 'drop files' : 'drag files or tap to browse'}
            </span>
            <span style={s.dropSub}>
              audio · image · vector · doc · bookmarks · code · data · 3d
            </span>
          </div>

          {/* URL input */}
          <div style={s.row}>
            <textarea
              style={s.textarea}
              placeholder="paste URLs (one per line)"
              value={urlInput}
              rows={2}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button onClick={addUrls} disabled={!urlInput.trim()} style={s.btn}>
              add
            </button>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div style={s.queue}>
              {queue.map((item) => (
                <div key={item.id} style={s.qRow}>
                  <span style={s.qGroup}>{item.kind === 'file' ? item.group : 'url'}</span>
                  <span style={s.qName}>
                    {item.kind === 'file'
                      ? `${item.file.name} · ${formatBytes(item.file.size)}`
                      : item.url}
                  </span>
                  <button onClick={() => removeItem(item.id)} style={s.removeBtn}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Note + tags */}
          <div style={s.row}>
            <input
              style={s.input}
              placeholder="optional note or routing hint"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {(['BUILD', 'GROW', 'RUN'] as const).map((tag) => (
              <button
                key={tag}
                style={s.tagBtn}
                onClick={() => setNote((n) => (n ? `${n} → ${tag}` : `→ ${tag}`))}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Status + submit */}
          <div style={s.submitRow}>
            {submitState.kind === 'submitting' && (
              <span style={s.status}>
                uploading {submitState.done}/{submitState.total}…
              </span>
            )}
            {submitState.kind === 'done' && (
              <span style={{ ...s.status, color: '#4ade80' }}>
                saved {submitState.count} item{submitState.count !== 1 ? 's' : ''} to Drive
                <button onClick={reset} style={s.linkBtn}>
                  clear
                </button>
              </span>
            )}
            {submitState.kind === 'error' && (
              <span style={{ ...s.status, color: '#f87171' }}>
                {submitState.message}
                <button onClick={reset} style={s.linkBtn}>
                  retry
                </button>
              </span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!queue.length || submitState.kind === 'submitting'}
              style={s.submitBtn}
            >
              {submitState.kind === 'submitting'
                ? '…'
                : `submit${queue.length ? ` (${fileCount + urlCount})` : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: '12px' },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid #2a2a2a',
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#888',
  },
  authBtn: {
    fontSize: '12px',
    fontFamily: 'monospace',
    padding: '4px 12px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#aaa',
    cursor: 'pointer',
  },
  authHint: { fontSize: '13px', color: '#555', fontFamily: 'monospace' },
  dropzone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '32px 16px',
    border: '1px dashed #2a2a2a',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    background: '#161616',
    userSelect: 'none',
  },
  dropzoneActive: { borderColor: '#6366f1', background: '#1a1a2e' },
  dropHint: { fontSize: '13px', fontFamily: 'monospace', color: '#666' },
  dropSub: { fontSize: '11px', fontFamily: 'monospace', color: '#444' },
  row: { display: 'flex', gap: '8px', alignItems: 'flex-start' },
  textarea: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ccc',
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    padding: '6px 10px',
    resize: 'vertical',
  },
  input: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ccc',
    background: '#161616',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    padding: '6px 10px',
  },
  btn: {
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '6px 14px',
    background: '#1e1e1e',
    border: '1px solid #2a2a2a',
    borderRadius: '6px',
    color: '#aaa',
    cursor: 'pointer',
    flexShrink: 0,
  },
  queue: {
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #1e1e1e',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  qRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '5px 10px',
    borderBottom: '1px solid #1a1a1a',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
  qGroup: { color: '#6366f1', flexShrink: 0, minWidth: '58px' },
  qName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: '#666',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: '#444',
    fontSize: '11px',
    padding: 0,
    flexShrink: 0,
  },
  tagBtn: {
    fontFamily: 'monospace',
    fontSize: '11px',
    padding: '4px 8px',
    background: 'transparent',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#555',
    flexShrink: 0,
  },
  submitRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    paddingTop: '4px',
  },
  status: { fontFamily: 'monospace', fontSize: '12px', color: '#555', flex: 1 },
  submitBtn: {
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '6px 18px',
    background: '#1e1e1e',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#ccc',
    cursor: 'pointer',
  },
  linkBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#6366f1',
    marginLeft: '8px',
    padding: 0,
  },
};
```

- [ ] **Step 2: Add `.env.local` with credentials (after completing Prerequisites A + B)**

Create `tools/intake/.env.local`:

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_DRIVE_FOLDER_ID=your-folder-id
```

- [ ] **Step 3: Start dev server and smoke test**

```bash
cd tools/intake && pnpm dev
```

Open `http://localhost:5174`. Verify:

- "Sign in with Google" button appears
- Clicking it opens Google OAuth popup
- After sign-in, drop zone appears
- Drop a test file — it appears in the queue with correct type group
- Paste a URL and click add — it appears in queue
- Click BUILD/GROW/RUN — note field updates
- Submit — file appears in your Google Drive Intake folder
- Receipt shows `saved N items to Drive`

- [ ] **Step 4: Typecheck**

```bash
cd tools/intake && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add tools/intake/src/
git commit -m "feat(intake): App.tsx — Google Drive upload, dropzone, URL input, note + tags"
```

---

### Task 3: Vercel deployment config

**Files:**

- Create: `tools/intake/vercel.json`

- [ ] **Step 1: Create vercel.json**

Create `tools/intake/vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "installCommand": "pnpm install",
  "framework": "vite"
}
```

- [ ] **Step 2: Deploy via Vercel MCP**

Use the Vercel MCP `deploy_to_vercel` tool to deploy `tools/intake/` as a new project named `hirobius-intake`. Set env vars `VITE_GOOGLE_CLIENT_ID` and `VITE_DRIVE_FOLDER_ID` in the Vercel project dashboard after first deploy.

Alternatively, via CLI:

```bash
cd tools/intake && npx vercel --prod
```

Follow prompts: new project, name `hirobius-intake`, root directory `./` (already in tools/intake).

- [ ] **Step 3: Add Vercel URL to Google Cloud OAuth**

After deploy, go back to [Google Cloud Console → Credentials → your OAuth client](https://console.cloud.google.com) and add the Vercel URL to:

- Authorized JavaScript origins: `https://hirobius-intake.vercel.app`
- Authorized redirect URIs: `https://hirobius-intake.vercel.app`

- [ ] **Step 4: Set env vars in Vercel dashboard**

In the Vercel project → Settings → Environment Variables, add:

- `VITE_GOOGLE_CLIENT_ID` = your client ID
- `VITE_DRIVE_FOLDER_ID` = your folder ID

Redeploy after setting env vars.

- [ ] **Step 5: Test on mobile**

Open the Vercel URL on your phone. Verify:

- Sign in works
- Tap to browse opens photo picker
- Screenshot uploads to Drive
- Manifest JSON appears in Drive Intake folder alongside the file

- [ ] **Step 6: Commit**

```bash
git add tools/intake/vercel.json
git commit -m "feat(intake): Vercel deployment config"
```
