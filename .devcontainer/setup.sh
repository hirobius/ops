#!/bin/bash
set -e

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Hirobius Portfolio — Codespace Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. pnpm ────────────────────────────────────────────────────────────────
echo "→ Installing pnpm..."
npm install -g pnpm@latest --silent

echo "→ Installing dependencies..."
pnpm install --frozen-lockfile

# ── 2. Claude Code CLI ─────────────────────────────────────────────────────
echo "→ Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code --silent

# ── 3. Claude config from repo ─────────────────────────────────────────────
echo "→ Syncing Claude config from repo..."
mkdir -p ~/.claude
node scripts/sync-claude-config.mjs

# ── 4. Codespace-specific settings.local.json ──────────────────────────────
# Desktop settings.local.json has Windows absolute paths — not valid here.
# Generate a clean Codespace version with appropriate permissions only.
echo "→ Writing Codespace settings.local.json..."
cat > ~/.claude/settings.local.json << 'EOF'
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(node *)",
      "Bash(git *)",
      "Bash(npm *)",
      "Read(/workspaces/**)",
      "WebFetch(domain:github.com)",
      "WebFetch(domain:api.github.com)",
      "WebFetch(domain:raw.githubusercontent.com)",
      "WebFetch(domain:docs.anthropic.com)",
      "WebFetch(domain:www.figma.com)",
      "WebFetch(domain:developers.figma.com)"
    ]
  }
}
EOF

# ── 5. Token pipeline ──────────────────────────────────────────────────────
echo "→ Building tokens..."
pnpm tokens

echo ""
echo "✓ Setup complete."
echo ""
echo "  Start dev server : pnpm dev"
echo "  Run all checks   : pnpm check"
echo "  Sync Claude config back to repo : node scripts/sync-claude-config.mjs --push"
echo ""
echo "  NOTE: Figma MCP requires the desktop app — not available in Codespace."
echo "        All other Claude Code capabilities are fully operational."
echo ""
