# OPS CC Plugins Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsed "Plugins" Disclosure to AgenticOSPage that lists all installed Claude Code skills (global + project-scoped) with a copy-to-clipboard terminal invocation command on click.

**Architecture:** A new dev-only `GET /api/cc-plugins` Vite middleware reads `~/.claude/skills/` (global) and `{project}/.claude/skills/` (project) — union of both, deduped by name, project taking precedence. A new `PluginsBar` component fetches on mount and renders tiles grouped by source (Project first, then Global). Clicking a tile toggles a panel showing `claude /skill-name` with a copy button.

**Tech Stack:** Node.js ESM (middleware), React + TypeScript (component), inline styles matching existing `SkillsBar` pattern, Vite plugin API (`configureServer`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `scripts/cc-plugins-middleware.mjs` | **Create** | `GET /api/cc-plugins` — reads skill dirs, parses SKILL.md frontmatter, returns JSON |
| `vite.config.mjs` | **Modify** | Mount `createCcPluginsMiddleware` at `/api/cc-plugins` |
| `src/app/pages/ops/agentic-os/cc-plugins.ts` | **Create** | `CcSkill` type + `fetchCcSkills()` wrapper |
| `src/app/pages/ops/agentic-os/PluginsBar.tsx` | **Create** | Renders skill tiles grouped by source; copy-to-clipboard on click |
| `src/app/pages/ops/agentic-os/AgenticOSPage.tsx` | **Modify** | Add `Plugins` Disclosure + `PluginsBar` import |

---

## Task 1: `cc-plugins-middleware.mjs` — skill directory reader

**Files:**
- Create: `scripts/cc-plugins-middleware.mjs`

- [ ] **Step 1: Create the file**

```js
/**
 * scripts/cc-plugins-middleware.mjs
 *
 * Dev-only middleware: GET /api/cc-plugins
 * Enumerates installed Claude Code skills from:
 *   - ~/.claude/skills/          (global user skills)
 *   - {cwd}/.claude/skills/      (project-scoped skills)
 * Reads SKILL.md frontmatter from each skill directory.
 * Project skills take precedence over global on name collision.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve }             from 'node:path';
import { homedir }                   from 'node:os';

/**
 * Parse the YAML-ish frontmatter block from a SKILL.md file.
 * Returns { name, description } — other keys ignored.
 * Handles single- and double-quoted values.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key   = line.slice(0, colonIdx).trim();
    let   value = line.slice(colonIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/**
 * Read all skill entries from a skills directory.
 * Silently skips dirs with no SKILL.md.
 *
 * @param {string} dir
 * @param {'global'|'project'} source
 * @returns {Array<{name:string,description:string,invocation:string,source:string}>}
 */
function readSkillsDir(dir, source) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const skills  = [];
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      try {
        const content = readFileSync(join(dir, entry.name, 'SKILL.md'), 'utf8');
        const fm      = parseFrontmatter(content);
        const name    = fm.name ?? entry.name;
        skills.push({
          name,
          description: fm.description ?? '',
          invocation:  `claude /${name}`,
          source,
        });
      } catch {
        // No SKILL.md — skip
      }
    }
    return skills;
  } catch {
    return [];
  }
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * @param {{ cwd: string }} opts
 */
export function createCcPluginsMiddleware({ cwd }) {
  return function ccPlugins(req, res, next) {
    if (req.method !== 'GET') return next();
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/') return next();

    const globalDir  = join(homedir(), '.claude', 'skills');
    const projectDir = join(resolve(cwd), '.claude', 'skills');

    const projectSkills = readSkillsDir(projectDir, 'project');
    const globalSkills  = readSkillsDir(globalDir,  'global');

    // Project skills take precedence; dedup by name
    const seen   = new Set();
    const skills = [];
    for (const skill of [...projectSkills, ...globalSkills]) {
      if (!seen.has(skill.name)) {
        seen.add(skill.name);
        skills.push(skill);
      }
    }

    jsonResponse(res, 200, { skills });
  };
}
```

- [ ] **Step 2: Verify it parses — quick smoke test**

Run from the project root:
```bash
node -e "
import('./scripts/cc-plugins-middleware.mjs').then(m => {
  // simulate req/res
  const res = { headers: {}, body: '' };
  res.setHeader = (k,v) => res.headers[k]=v;
  res.end = (b) => { res.body = b; console.log(JSON.parse(b).skills.slice(0,3)); };
  m.createCcPluginsMiddleware({ cwd: process.cwd() })({ method:'GET', url:'/' }, res, () => {});
});
"
```

Expected: prints array with objects like `{ name: 'extract-design', description: '...', invocation: 'claude /extract-design', source: 'project' }`.

- [ ] **Step 3: Commit**

```bash
git add scripts/cc-plugins-middleware.mjs
git commit -m "feat(ops): cc-plugins middleware — enumerate installed CC skills"
```

---

## Task 2: Mount the middleware in `vite.config.mjs`

**Files:**
- Modify: `vite.config.mjs`

- [ ] **Step 1: Add the import**

At the top of `vite.config.mjs`, alongside the existing middleware imports, add:

```js
import { createCcPluginsMiddleware } from './scripts/cc-plugins-middleware.mjs';
```

- [ ] **Step 2: Add the Vite plugin**

Inside the `plugins: [` array, after the existing `ops-skills-api` plugin block, add:

```js
{
  name: 'ops-cc-plugins-api',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(
      '/api/cc-plugins',
      createCcPluginsMiddleware({ cwd: __dirname }),
    );
  },
},
```

- [ ] **Step 3: Verify the endpoint is live**

Start the dev server (`pnpm dev`) then in a separate terminal:
```bash
curl -s http://localhost:5173/api/cc-plugins | node -e "
const d=[];process.stdin.on('data',c=>d.push(c));
process.stdin.on('end',()=>{ const r=JSON.parse(Buffer.concat(d)); console.log('total:',r.skills.length,'project:',r.skills.filter(s=>s.source==='project').map(s=>s.name)); });
"
```

Expected output: `total: 29  project: [ 'extract-design' ]`

- [ ] **Step 4: Commit**

```bash
git add vite.config.mjs
git commit -m "feat(ops): mount GET /api/cc-plugins in vite dev server"
```

---

## Task 3: `cc-plugins.ts` — types + fetch wrapper

**Files:**
- Create: `src/app/pages/ops/agentic-os/cc-plugins.ts`

- [ ] **Step 1: Create the file**

```ts
/**
 * agentic-os/cc-plugins.ts — types + fetch wrapper for GET /api/cc-plugins.
 * Mirrors the skills.ts pattern for the internal script catalog.
 */

export interface CcSkill {
  name:        string;
  description: string;
  invocation:  string;
  source:      'global' | 'project';
}

interface CcPluginsResponse {
  skills: CcSkill[];
}

export async function fetchCcSkills(): Promise<CcSkill[]> {
  try {
    const res  = await fetch('/api/cc-plugins');
    const body = await res.json() as CcPluginsResponse;
    return body.skills ?? [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/ops/agentic-os/cc-plugins.ts
git commit -m "feat(ops): cc-plugins types + fetchCcSkills wrapper"
```

---

## Task 4: `PluginsBar.tsx` — the component

**Files:**
- Create: `src/app/pages/ops/agentic-os/PluginsBar.tsx`

- [ ] **Step 1: Create the file**

```tsx
/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import hds from '../../../design-system/tokens';
import { fetchCcSkills, type CcSkill } from './cc-plugins';

type Source = 'global' | 'project';

const SOURCE_ORDER: readonly Source[] = ['project', 'global'];
const SOURCE_LABEL: Record<Source, string> = {
  project: 'Project',
  global:  'Global',
};

export function PluginsBar() {
  const [skills,   setSkills]   = useState<CcSkill[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchCcSkills().then((s) => {
      setSkills(s);
      setLoading(false);
    });
  }, []);

  const toggle = useCallback((name: string) => {
    setExpanded((prev) => (prev === name ? null : name));
  }, []);

  if (loading) return <div style={s.muted}>loading…</div>;
  if (skills.length === 0) return <div style={s.muted}>No Claude Code skills installed.</div>;

  const grouped = new Map<Source, CcSkill[]>(SOURCE_ORDER.map((src) => [src, []]));
  for (const skill of skills) grouped.get(skill.source)?.push(skill);

  return (
    <div style={s.root}>
      {SOURCE_ORDER.map((src) => {
        const group = grouped.get(src) ?? [];
        if (group.length === 0) return null;
        return (
          <div key={src} style={s.groupSection}>
            <div style={s.groupHead}>
              <span style={s.groupLabel}>{SOURCE_LABEL[src]}</span>
              <span style={s.groupCount}>{group.length}</span>
            </div>
            <div style={s.groupGrid}>
              {group.map((skill) => (
                <SkillTile
                  key={skill.name}
                  skill={skill}
                  open={expanded === skill.name}
                  onToggle={toggle}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkillTile({
  skill,
  open,
  onToggle,
}: {
  skill:    CcSkill;
  open:     boolean;
  onToggle: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(skill.invocation);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  }, [skill.invocation]);

  return (
    <div style={s.tile}>
      <button
        type="button"
        onClick={() => onToggle(skill.name)}
        className="hds-focus"
        style={{
          ...s.button,
          borderColor: open
            ? 'var(--semantic-color-content-accent)'
            : 'var(--semantic-color-border-default)',
        }}
      >
        <span
          style={{
            ...s.buttonIndicator,
            color: open
              ? 'var(--semantic-color-content-accent)'
              : 'var(--semantic-color-content-secondary)',
          }}
          aria-hidden="true"
        >
          ▸
        </span>
        <span style={s.buttonLabel}>{skill.name}</span>
        <span style={s.buttonHint}>
          {skill.description.length > 60
            ? `${skill.description.slice(0, 60)}…`
            : skill.description}
        </span>
      </button>

      {open && (
        <div style={s.panel}>
          <div style={s.panelCmd}>
            <code style={s.cmdText}>{skill.invocation}</code>
            <button
              type="button"
              onClick={handleCopy}
              className="hds-focus"
              style={s.copyBtn}
            >
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
          {skill.description && <p style={s.panelDesc}>{skill.description}</p>}
        </div>
      )}
    </div>
  );
}

const s = {
  root: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           hds.space.px16,
  },
  muted: {
    fontFamily: hds.monoFamily,
    fontSize:   hds.fontSize.xs,
    color:      'var(--semantic-color-content-disabled)',
  },
  groupSection: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           hds.space.px8,
    minWidth:      0,
  },
  groupHead: {
    display:    'flex',
    alignItems: 'baseline',
    gap:        hds.space.px8,
  },
  groupLabel: {
    fontFamily:    hds.monoFamily,
    fontSize:      hds.fontSize.xs,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color:         'var(--semantic-color-content-secondary)',
  },
  groupCount: {
    fontFamily: hds.monoFamily,
    fontSize:   hds.fontSize.xs,
    color:      'var(--semantic-color-content-disabled)',
  },
  groupGrid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap:                 hds.space.px8,
  },
  tile: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           hds.space.px8,
    minWidth:      0,
  },
  button: {
    display:             'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gridTemplateRows:    'auto auto',
    columnGap:           hds.space.px8,
    rowGap:              hds.space.px2,
    padding:             `${hds.space.px12} ${hds.space.px12}`,
    minHeight:           '56px',
    background:          'var(--semantic-color-surface-raised)',
    color:               'var(--semantic-color-content-primary)',
    border:              '1px solid',
    borderRadius:        '8px',
    cursor:              'pointer',
    textAlign:           'left' as const,
    fontFamily:          'inherit',
  },
  buttonIndicator: {
    fontFamily: hds.monoFamily,
    fontSize:   hds.fontSize.lg,
    lineHeight: 1,
    gridRow:    '1 / span 2',
    alignSelf:  'center',
  },
  buttonLabel: {
    fontSize:     hds.fontSize.sm,
    color:        'var(--semantic-color-content-primary)',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  },
  buttonHint: {
    fontSize:     hds.fontSize.xs,
    color:        'var(--semantic-color-content-secondary)',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  },
  panel: {
    border:        '1px solid var(--semantic-color-border-default)',
    borderRadius:  '6px',
    padding:       hds.space.px8,
    background:    'var(--semantic-color-surface-raised)',
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           hds.space.px8,
    minWidth:      0,
  },
  panelCmd: {
    display:    'flex',
    alignItems: 'center',
    gap:        hds.space.px8,
    flexWrap:   'wrap' as const,
  },
  cmdText: {
    fontFamily: hds.monoFamily,
    fontSize:   hds.fontSize.sm,
    color:      'var(--semantic-color-content-primary)',
    flex:       1,
  },
  copyBtn: {
    fontFamily:   hds.monoFamily,
    fontSize:     hds.fontSize.xs,
    color:        'var(--semantic-color-content-accent)',
    background:   'none',
    border:       'none',
    cursor:       'pointer',
    padding:      `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: '4px',
  },
  panelDesc: {
    margin:     0,
    fontSize:   hds.fontSize.xs,
    color:      'var(--semantic-color-content-secondary)',
    lineHeight: 1.5,
  },
} satisfies Record<string, CSSProperties>;
```

- [ ] **Step 2: Type-check**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/ops/agentic-os/PluginsBar.tsx
git commit -m "feat(ops): PluginsBar — CC skills list with copy-to-clipboard invocation"
```

---

## Task 5: Wire `PluginsBar` into `AgenticOSPage`

**Files:**
- Modify: `src/app/pages/ops/agentic-os/AgenticOSPage.tsx`

- [ ] **Step 1: Add the import**

In `AgenticOSPage.tsx`, alongside the existing component imports, add:

```tsx
import { PluginsBar } from './PluginsBar';
```

- [ ] **Step 2: Add the Disclosure**

After the existing `Skills` Disclosure and before the `Inbox` Disclosure:

```tsx
<Disclosure id="agentic-os.plugins" label="Plugins" hint="Claude Code skills">
  <PluginsBar />
</Disclosure>
```

The full block context for orientation — you're inserting between these two existing blocks:

```tsx
{/* existing */}
<Disclosure id="agentic-os.skills" label="Skills" hint="whitelisted scripts">
  <SkillsBar />
</Disclosure>

{/* ADD THIS */}
<Disclosure id="agentic-os.plugins" label="Plugins" hint="Claude Code skills">
  <PluginsBar />
</Disclosure>

{/* existing */}
<Disclosure id="agentic-os.inbox" label="Inbox" hint={`${proposals.length} proposed · not yet approved`}>
  <ProposedUnitsRail entries={PROPOSED_UNITS} />
</Disclosure>
```

- [ ] **Step 3: Type-check + layout test**

```bash
pnpm typecheck && pnpm test:layout
```

Expected: 0 errors, all tests green.

- [ ] **Step 4: Manual browser check**

Open `http://localhost:5173/ops`. Find the "Plugins" Disclosure (collapsed by default). Expand it. Verify:
- "Project" group shows `extract-design`
- "Global" group shows all ~28 superpowers skills
- Clicking any tile opens the panel with `claude /skill-name`
- Clicking "copy" copies to clipboard (paste into a terminal to verify)
- Clicking the same tile again collapses the panel

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/ops/agentic-os/AgenticOSPage.tsx
git commit -m "feat(ops): add Plugins Disclosure to AgenticOSPage — 29 CC skills surfaced"
```
