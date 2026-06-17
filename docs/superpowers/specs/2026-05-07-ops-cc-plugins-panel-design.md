# Design: OPS — Claude Code Plugins Panel

**Date:** 2026-05-07  
**Status:** Approved

---

## Problem

The OPS dashboard already surfaces internal repo scripts via `SkillsBar`. There is no visibility into which Claude Code skills (superpowers, frontend-design, etc.) are installed, nor a quick way to copy their invocation commands into a terminal session.

---

## Goal

Add a collapsed **Plugins** `Disclosure` section to `AgenticOSPage` that:
- Lists all installed Claude Code skills, grouped by plugin
- Shows each skill's name and description
- On click, reveals the terminal command to invoke it (`claude /skill-name`)
- Starts collapsed (no noise until needed)
- Requires zero manual catalog maintenance — new skills appear automatically when plugins are installed

---

## Architecture

### 1. New dev endpoint — `GET /api/cc-plugins`

Added to `scripts/skill-runner-middleware.mjs`.

**Logic:**
1. Read `~/.claude/plugins/installed_plugins.json`
2. For each plugin entry, resolve the `installPath`
3. Walk `installPath/skills/` for subdirectories (each = one skill)
4. Read `SKILL.md` frontmatter (`name`, `description`) from each skill dir
5. Return structured JSON

**Response shape:**
```json
{
  "plugins": [
    {
      "id": "superpowers@superpowers-marketplace",
      "name": "superpowers",
      "version": "5.1.0",
      "skills": [
        {
          "name": "brainstorming",
          "description": "You MUST use this before any creative work...",
          "invocation": "claude /brainstorming"
        }
      ]
    }
  ]
}
```

**Error handling:** If `installed_plugins.json` is missing or unreadable, return `{ plugins: [] }` — panel renders empty rather than crashing.

**Route:** `GET /api/cc-plugins` (no POST; read-only, no side-effects).

### 2. New types + fetch — `cc-plugins.ts`

Mirrors `skills.ts` pattern:
- `CcPlugin`, `CcSkill` types
- `fetchCcPlugins(): Promise<CcPlugin[]>` wraps `GET /api/cc-plugins`

### 3. New component — `PluginsBar.tsx`

- Fetches `/api/cc-plugins` on mount
- Renders one group per plugin, each group header = plugin name + version + skill count
- Skill tiles: same visual pattern as `SkillTile` in `SkillsBar`
- **Click action**: toggles an inline panel showing the terminal command string with a copy-to-clipboard button
- No run button, no exit-code output, no loading state (read-only)
- Loading state while fetching: a single muted "loading…" line
- Empty state: "No Claude Code plugins installed" if `plugins` is empty

**Tile panel content:**
```
claude /brainstorming
[Copy]
```
Plus the skill's description below.

### 4. `AgenticOSPage.tsx` change

One new `Disclosure` after the existing Skills disclosure:

```tsx
<Disclosure id="agentic-os.plugins" label="Plugins" hint="Claude Code skills">
  <PluginsBar />
</Disclosure>
```

Hint is static `"Claude Code skills"` — no async count needed for a collapsed section.

---

## Files touched

| File | Change |
|---|---|
| `scripts/skill-runner-middleware.mjs` | Add `GET /api/cc-plugins` route |
| `src/app/pages/ops/agentic-os/cc-plugins.ts` | New — types + fetch wrapper |
| `src/app/pages/ops/agentic-os/PluginsBar.tsx` | New — component |
| `src/app/pages/ops/agentic-os/AgenticOSPage.tsx` | Add Plugins Disclosure + import |

---

## design-extract note

`design-extract` is not currently installed. Install with:
```
npx skills add Manavarya09/design-extract
```
It will appear in the Plugins panel automatically on next page load — no code changes required.

---

## Out of scope

- Triggering CC skills from the browser (they must run in a terminal Claude Code session)
- Installing/uninstalling plugins from the UI
- Filtering or categorizing skills beyond plugin grouping
