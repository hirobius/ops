# Skills Cleanup + Intake Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Skills button bar (replaced by firingChannel column in ValidatorsTab), and add a persistent intake widget to /ops that saves files + URLs to `_data/intake/` for later Claude Code processing.

**Architecture:** Two independent subsystems. (1) ValidatorsTab gains a `firingChannel` column from the existing registry.json data; SkillsBar + skills.ts are deleted and the Skills disclosure is removed from AgenticOSPage. (2) IntakeWidget uses react-dropzone for multi-file drag-and-drop + a URL paste field; a new `intake-middleware.mjs` writes uploads to `_data/intake/` and appends a JSONL log entry — no AI API calls, processing happens later via Claude Code. Files are NOT sent to the Anthropic API from the middleware.

**Tech Stack:** React, react-dropzone, busboy (multipart parsing), TypeScript, Node.js connect middleware (Vite dev server pattern)

---

## File Map

| Action | Path                                             | Purpose                                                            |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| Modify | `src/app/pages/ops/atlas/validators-tab.tsx`     | Add `firingChannel` to Gate type + table column                    |
| Modify | `src/app/pages/ops/agentic-os/AgenticOSPage.tsx` | Remove Skills disclosure, add IntakeWidget                         |
| Delete | `src/app/pages/ops/agentic-os/SkillsBar.tsx`     | No longer needed                                                   |
| Delete | `src/app/pages/ops/agentic-os/skills.ts`         | No longer needed                                                   |
| Create | `scripts/intake-middleware.mjs`                  | POST /api/intake — parse multipart + URLs, write to \_data/intake/ |
| Modify | `vite.config.mjs`                                | Mount intake middleware at /api/intake                             |
| Create | `src/app/pages/ops/agentic-os/IntakeWidget.tsx`  | Drop zone + URL input + note + submit                              |
| Modify | `.gitignore`                                     | Add `_data/`                                                       |
| Modify | `package.json`                                   | Add react-dropzone + busboy                                        |

---

### Task 1: Add firingChannel column to ValidatorsTab

**Files:**

- Modify: `src/app/pages/ops/atlas/validators-tab.tsx`

The `Gate` interface is missing `firingChannel`. The registry has five values: `pre-commit`, `commit-msg`, `pnpm-meta`, `ci-pr`, `manual`. Add the column between Fixture and Last fired.

- [ ] **Step 1: Update Gate interface and add channel color helper**

In `validators-tab.tsx`, update the `Gate` interface and add a helper after `severityOrder`:

```ts
interface Gate {
  id: string;
  description?: string;
  severity: Severity;
  gateScript: string;
  fixturePath: string | null;
  firingChannel?: string;
  owner?: string;
  lastFiringAt?: string | null;
  lastViolationAt?: string | null;
}
```

Add this helper function after `sortGates`:

```ts
function channelColor(channel: string | undefined): string {
  if (channel === 'pre-commit' || channel === 'commit-msg')
    return 'var(--semantic-color-feedback-success)';
  if (channel === 'ci-pr') return 'var(--semantic-color-content-accent)';
  if (channel === 'pnpm-meta') return 'var(--semantic-color-content-secondary)';
  return 'var(--semantic-color-content-tertiary)'; // manual / unknown
}
```

- [ ] **Step 2: Add Channel column header**

In the `<thead>` row, insert a new `<th>` between Fixture and Last fired:

```tsx
<th style={{ ...s.th, width: '22%' }}>Gate ID</th>
<th style={{ ...s.th, width: '8%' }}>Severity</th>
<th style={{ ...s.th, width: '24%' }}>Script</th>
<th style={{ ...s.th, width: '7%' }}>Fixture</th>
<th style={{ ...s.th, width: '12%' }}>Channel</th>
<th style={{ ...s.th, width: '12%' }}>Last fired</th>
<th style={{ ...s.th, width: '8%' }}>Owner</th>
```

- [ ] **Step 3: Add Channel cell in tbody row**

In the `<tr>` inside `gates.map`, insert a new `<td>` between the fixture cell and the firedCell:

```tsx
<td style={{ ...s.td, ...s.channelCell }}>
  <span
    style={{
      color: channelColor(gate.firingChannel),
      fontFamily: 'var(--primitive-font-family-mono, monospace)',
      fontSize: '11px',
    }}
  >
    {gate.firingChannel ?? '—'}
  </span>
</td>
```

Also update `colSpan={6}` on the description expand row to `colSpan={7}`.

- [ ] **Step 4: Add channelCell style**

In the `s` object at the bottom of the file, add:

```ts
channelCell: {
  whiteSpace: 'nowrap',
} satisfies React.CSSProperties,
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -v AgenticOSPage
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/ops/atlas/validators-tab.tsx
git commit -m "feat(ops): validators tab — add firingChannel column"
```

---

### Task 2: Remove Skills bar from the ops page

**Files:**

- Modify: `src/app/pages/ops/agentic-os/AgenticOSPage.tsx`
- Delete: `src/app/pages/ops/agentic-os/SkillsBar.tsx`
- Delete: `src/app/pages/ops/agentic-os/skills.ts`

- [ ] **Step 1: Remove Skills disclosure from AgenticOSPage**

In `AgenticOSPage.tsx`, delete these two lines from the imports:

```ts
import { SkillsBar } from './SkillsBar';
```

And delete this JSX block:

```tsx
<Disclosure id="agentic-os.skills" label="Skills" hint="whitelisted scripts">
  <SkillsBar />
</Disclosure>
```

- [ ] **Step 2: Delete SkillsBar and skills.ts**

```bash
rm src/app/pages/ops/agentic-os/SkillsBar.tsx
rm src/app/pages/ops/agentic-os/skills.ts
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -v AgenticOSPage
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/pages/ops/agentic-os/
git commit -m "chore(ops): remove Skills bar — scripts now visible in ValidatorsTab firingChannel column"
```

---

### Task 3: Install dependencies and create staging directory

**Files:**

- Modify: `package.json`
- Modify: `.gitignore`
- Create: `_data/intake/.gitkeep`

- [ ] **Step 1: Install react-dropzone and busboy**

```bash
pnpm add react-dropzone busboy
```

Expected: both packages added to `dependencies` in package.json.

- [ ] **Step 2: Create intake staging directory and gitkeep**

```bash
mkdir -p _data/intake
touch _data/intake/.gitkeep
```

- [ ] **Step 3: Add \_data to .gitignore except gitkeep**

Open `.gitignore` and add at the end:

```
# Intake staging — files dropped via /ops intake widget
_data/intake/*
!_data/intake/.gitkeep
_data/intake-log.jsonl
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml _data/intake/.gitkeep .gitignore
git commit -m "chore(ops): add react-dropzone + busboy deps, intake staging dir"
```

---

### Task 4: Create intake-middleware.mjs

**Files:**

- Create: `scripts/intake-middleware.mjs`

Handles `POST /api/intake`. Accepts multipart form data: file fields (`files`) and text fields (`urls` newline-separated, `note` string). Writes each file to `_data/intake/{timestamp}-{originalname}`. Appends a JSONL entry to `_data/intake-log.jsonl`. Returns a JSON receipt. No AI calls.

- [ ] **Step 1: Create the middleware file**

Create `scripts/intake-middleware.mjs` with this content:

```js
/**
 * scripts/intake-middleware.mjs
 *
 * Dev-only Connect middleware for POST /api/intake.
 * Accepts multipart uploads (files) + text fields (urls, note).
 * Writes files to _data/intake/ and appends a JSONL entry to
 * _data/intake-log.jsonl for later Claude Code processing.
 *
 * No AI calls — processing happens when Claude Code picks up the log.
 */

import { createWriteStream, mkdirSync, appendFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';

const TYPE_GROUPS = {
  '.mp3': 'audio',
  '.m4a': 'audio',
  '.wav': 'audio',
  '.webm': 'audio',
  '.ogg': 'audio',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
  '.gif': 'image',
  '.svg': 'vector',
  '.eps': 'vector',
  '.ai': 'vector',
  '.dxf': 'vector',
  '.pdf': 'document',
  '.txt': 'document',
  '.md': 'document',
  '.html': 'bookmarks',
  '.js': 'code',
  '.mjs': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.css': 'code',
  '.scss': 'code',
  '.json': 'data',
  '.yaml': 'data',
  '.yml': 'data',
  '.csv': 'data',
  '.obj': '3d',
  '.stl': '3d',
  '.3mf': '3d',
  '.glb': '3d',
  '.gltf': '3d',
  '.blend': '3d',
  '.gcode': '3d',
};

function typeGroup(filename) {
  return TYPE_GROUPS[extname(filename).toLowerCase()] ?? 'other';
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * @param {{ cwd: string }} options
 * @returns {import('connect').HandleFunction}
 */
export function createIntakeMiddleware({ cwd }) {
  const stagingDir = join(cwd, '_data', 'intake');
  const logPath = join(cwd, '_data', 'intake-log.jsonl');

  mkdirSync(stagingDir, { recursive: true });

  return function intakeMiddleware(req, res, next) {
    if (req.method !== 'POST') return next();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const savedFiles = [];
    let urls = [];
    let note = '';

    const bb = busboy({ headers: req.headers, limits: { fileSize: 500 * 1024 * 1024 } });

    bb.on('file', (fieldname, stream, info) => {
      const safe = basename(info.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const outName = `${timestamp}-${safe}`;
      const outPath = join(stagingDir, outName);
      const ws = createWriteStream(outPath);

      pipeline(stream, ws)
        .then(() => {
          savedFiles.push({
            name: info.filename,
            path: `_data/intake/${outName}`,
            typeGroup: typeGroup(info.filename),
          });
        })
        .catch(() => {
          stream.resume(); // drain on error
        });
    });

    bb.on('field', (name, val) => {
      if (name === 'urls')
        urls = val
          .split('\n')
          .map((u) => u.trim())
          .filter(Boolean);
      if (name === 'note') note = val.trim();
    });

    bb.on('finish', () => {
      const entry = {
        receivedAt: new Date().toISOString(),
        files: savedFiles,
        urls,
        note,
      };

      try {
        appendFileSync(logPath, JSON.stringify(entry) + '\n');
      } catch {
        // non-fatal — receipt still returned
      }

      json(res, 200, { ok: true, ...entry });
    });

    bb.on('error', (err) => {
      json(res, 500, { ok: false, error: err.message });
    });

    req.pipe(bb);
  };
}
```

- [ ] **Step 2: Syntax check**

```bash
node --check scripts/intake-middleware.mjs && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/intake-middleware.mjs
git commit -m "feat(ops): intake-middleware — multipart + URL intake, writes to _data/intake/"
```

---

### Task 5: Mount intake middleware in vite.config.mjs

**Files:**

- Modify: `vite.config.mjs`

- [ ] **Step 1: Add import at the top of vite.config.mjs**

After the existing middleware imports (around line 11), add:

```js
import { createIntakeMiddleware } from './scripts/intake-middleware.mjs';
```

- [ ] **Step 2: Add plugin block**

After the `ops-services-api` plugin block (the last one before the pod-tail api), add:

```js
{
  name: 'ops-intake-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(
      '/api/intake',
      createIntakeMiddleware({ cwd: __dirname }),
    );
  },
},
```

- [ ] **Step 3: Syntax check**

```bash
node --check vite.config.mjs && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add vite.config.mjs
git commit -m "feat(ops): mount /api/intake middleware in vite dev server"
```

---

### Task 6: Create IntakeWidget.tsx

**Files:**

- Create: `src/app/pages/ops/agentic-os/IntakeWidget.tsx`

Persistent collapsible widget. Drop zone accepts all intake formats + click-to-browse. URL textarea for pasting multiple links. Optional note field with BUILD/GROW/RUN quick-fill buttons. Queue shows each item (name, type group, remove button) before submit. After submit, shows a receipt.

- [ ] **Step 1: Create the component**

Create `src/app/pages/ops/agentic-os/IntakeWidget.tsx`:

```tsx
/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import { useState, useCallback, type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import hds from '../../../design-system/tokens';

// ── Accept map ──────────────────────────────────────────────────────────────

const ACCEPT = {
  'audio/*': ['.mp3', '.m4a', '.wav', '.webm', '.ogg'],
  'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
  'image/svg+xml': ['.svg'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt', '.md', '.csv', '.yaml', '.yml'],
  'text/html': ['.html'],
  'application/json': ['.json'],
  'text/javascript': ['.js', '.mjs', '.ts', '.tsx', '.css', '.scss'],
  'model/obj': ['.obj'],
  'model/stl': ['.stl'],
  'model/3mf': ['.3mf'],
  'model/gltf+json': ['.gltf'],
  'model/gltf-binary': ['.glb'],
  'application/octet-stream': ['.blend', '.gcode', '.eps', '.ai', '.dxf'],
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

// ── Types ───────────────────────────────────────────────────────────────────

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
  | { kind: 'submitting' }
  | { kind: 'done'; files: number; urls: number }
  | { kind: 'error'; message: string };

let idSeq = 0;
function nextId() {
  return String(++idSeq);
}

// ── Component ────────────────────────────────────────────────────────────────

export function IntakeWidget() {
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [note, setNote] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const onDrop = useCallback((accepted: File[]) => {
    setQueue((prev) => [
      ...prev,
      ...accepted.map((f) => ({
        kind: 'file' as const,
        id: nextId(),
        file: f,
        group: typeGroup(f.name),
      })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    noClick: false,
  });

  const addUrls = useCallback(() => {
    const lines = urlInput
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    setQueue((prev) => [
      ...prev,
      ...lines.map((url) => ({ kind: 'url' as const, id: nextId(), url })),
    ]);
    setUrlInput('');
  }, [urlInput]);

  const removeItem = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (queue.length === 0) return;
    setSubmitState({ kind: 'submitting' });

    const fd = new FormData();
    const fileItems = queue.filter((i): i is QueuedFile => i.kind === 'file');
    const urlItems = queue.filter((i): i is QueuedUrl => i.kind === 'url');

    for (const item of fileItems) fd.append('files', item.file, item.file.name);
    fd.append('urls', urlItems.map((i) => i.url).join('\n'));
    fd.append('note', note);

    try {
      const res = await fetch('/api/intake', { method: 'POST', body: fd });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? 'unknown error');
      setSubmitState({ kind: 'done', files: fileItems.length, urls: urlItems.length });
      setQueue([]);
      setNote('');
    } catch (err) {
      setSubmitState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [queue, note]);

  const reset = useCallback(() => setSubmitState({ kind: 'idle' }), []);

  const fileCount = queue.filter((i) => i.kind === 'file').length;
  const urlCount = queue.filter((i) => i.kind === 'url').length;

  return (
    <div style={s.root}>
      {/* Drop zone */}
      <div {...getRootProps()} style={{ ...s.dropzone, ...(isDragActive ? s.dropzoneActive : {}) }}>
        <input {...getInputProps()} />
        <span style={s.dropHint}>
          {isDragActive ? 'drop files' : 'drag files here or click to browse'}
        </span>
        <span style={s.dropSub}>
          audio · image · vector · document · bookmarks · code · data · 3d
        </span>
      </div>

      {/* URL input */}
      <div style={s.urlRow}>
        <textarea
          style={s.urlInput}
          placeholder="paste URLs (one per line)"
          value={urlInput}
          rows={2}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addUrls();
          }}
        />
        <button type="button" onClick={addUrls} disabled={!urlInput.trim()} style={s.addBtn}>
          add
        </button>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div style={s.queue}>
          {queue.map((item) => (
            <div key={item.id} style={s.queueRow}>
              <span style={s.queueGroup}>{item.kind === 'file' ? item.group : 'url'}</span>
              <span style={s.queueName}>
                {item.kind === 'file'
                  ? `${item.file.name} · ${formatBytes(item.file.size)}`
                  : item.url}
              </span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                style={s.removeBtn}
                aria-label="remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Note + tags + submit */}
      <div style={s.footer}>
        <div style={s.noteRow}>
          <input
            style={s.noteInput}
            placeholder="optional note or routing hint"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {(['BUILD', 'GROW', 'RUN'] as const).map((tag) => (
            <button
              key={tag}
              type="button"
              style={s.tagBtn}
              onClick={() => setNote((n) => (n ? `${n} → ${tag}` : `→ ${tag}`))}
            >
              {tag}
            </button>
          ))}
        </div>

        <div style={s.submitRow}>
          {submitState.kind === 'done' && (
            <span style={s.receipt}>
              saved {submitState.files} file{submitState.files !== 1 ? 's' : ''}
              {submitState.urls > 0
                ? ` · ${submitState.urls} URL${submitState.urls !== 1 ? 's' : ''}`
                : ''}
              {' → _data/intake/'}
              <button type="button" onClick={reset} style={s.resetBtn}>
                clear
              </button>
            </span>
          )}
          {submitState.kind === 'error' && (
            <span style={s.errorMsg}>
              {submitState.message}
              <button type="button" onClick={reset} style={s.resetBtn}>
                retry
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={queue.length === 0 || submitState.kind === 'submitting'}
            style={s.submitBtn}
          >
            {submitState.kind === 'submitting'
              ? '…'
              : `submit${queue.length > 0 ? ` (${fileCount + urlCount})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
  },
  dropzone: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: hds.space.px4,
    padding: hds.space.px24,
    border: '1px dashed var(--semantic-color-border-default)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    background: 'var(--semantic-color-surface-base)',
  },
  dropzoneActive: {
    borderColor: 'var(--semantic-color-content-accent)',
    background: 'var(--semantic-color-surface-raised)',
  },
  dropHint: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
  },
  dropSub: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-tertiary)',
  },
  urlRow: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'flex-start',
  },
  urlInput: {
    flex: 1,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: '4px',
    padding: `${hds.space.px4} ${hds.space.px8}`,
    resize: 'vertical' as const,
  },
  addBtn: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `${hds.space.px4} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--semantic-color-content-primary)',
    flexShrink: 0,
  },
  queue: {
    display: 'flex',
    flexDirection: 'column' as const,
    border: '1px solid var(--semantic-color-border-subtle)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  queueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
    fontSize: hds.fontSize.xs,
    fontFamily: hds.monoFamily,
  },
  queueGroup: {
    color: 'var(--semantic-color-content-accent)',
    flexShrink: 0,
    minWidth: '58px',
  },
  queueName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    color: 'var(--semantic-color-content-secondary)',
  },
  removeBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--semantic-color-content-tertiary)',
    fontSize: hds.fontSize.xs,
    lineHeight: 1,
    padding: '0',
    flexShrink: 0,
  },
  footer: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
  },
  noteRow: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'center',
  },
  noteInput: {
    flex: 1,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: '4px',
    padding: `${hds.space.px4} ${hds.space.px8}`,
  },
  tagBtn: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    background: 'transparent',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--semantic-color-content-secondary)',
    flexShrink: 0,
  },
  submitRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: hds.space.px8,
  },
  submitBtn: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `${hds.space.px4} ${hds.space.px16}`,
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--semantic-color-content-primary)',
  },
  receipt: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-feedback-success)',
    flex: 1,
  },
  errorMsg: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-feedback-error)',
    flex: 1,
  },
  resetBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-accent)',
    marginLeft: '8px',
    padding: 0,
  },
} satisfies Record<string, CSSProperties>;
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -v AgenticOSPage
```

Expected: no errors from IntakeWidget.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/ops/agentic-os/IntakeWidget.tsx
git commit -m "feat(ops): IntakeWidget — drop zone + URL input + note + BUILD/GROW/RUN tags"
```

---

### Task 7: Wire IntakeWidget into AgenticOSPage

**Files:**

- Modify: `src/app/pages/ops/agentic-os/AgenticOSPage.tsx`

Place the intake widget as a persistent (non-collapsible) section between StatusBanner and KpiCards so it's always accessible without expanding a disclosure.

- [ ] **Step 1: Add import**

In `AgenticOSPage.tsx`, add to the imports:

```ts
import { IntakeWidget } from './IntakeWidget';
```

- [ ] **Step 2: Add IntakeWidget section**

In the JSX, between `<StatusBanner triage={triage} />` and `<KpiCards triage={triage} units={UNITS} />`, add:

```tsx
<Section label="Intake" hint="files · URLs · recordings → _data/intake/">
  <IntakeWidget />
</Section>
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | grep -v AgenticOSPage
```

Expected: no errors.

- [ ] **Step 4: Smoke test in browser**

Start the dev server: `pnpm dev`

Open `/ops`. Verify:

- Intake section visible between status banner and KPI cards
- Drop zone accepts drag-and-drop of an audio file
- URL textarea + add button queues a URL
- BUILD/GROW/RUN buttons append to note field
- Submit POSTs to `/api/intake` and shows receipt
- `_data/intake/` contains the saved file
- `_data/intake-log.jsonl` has a JSONL entry

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/ops/agentic-os/AgenticOSPage.tsx
git commit -m "feat(ops): wire IntakeWidget into /ops — persistent intake section"
```
