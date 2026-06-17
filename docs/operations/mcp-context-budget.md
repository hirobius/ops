# MCP Context Budget Audit

**Date:** 2026-05-04  
**Auditor:** haiku-pod-mcp-audit  
**Scope:** Active MCP servers in the Hirobius Design System project

## Overview

Multi-modal Context Protocol (MCP) servers are auto-loaded by the Claude Code harness and contribute significantly to per-session token overhead, even when unused. This audit catalogs active MCPs, estimates their token cost, and recommends load strategies.

Reference: Mario Zechner's analysis ([Playwright-MCP-13.7k-token observation](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)) highlights how unused MCP schemas can inflate prompt context by thousands of tokens.

## Active MCP Servers

| Server | Tools | Auto-Load | Estimated Tokens | Strategy |
|--------|-------|-----------|------------------|----------|
| Figma | 20 | Yes | ~4,000 | Move to on-demand |
| Gmail | 9 | Yes | ~1,800 | Keep auto-load (ops freq) |
| Google Drive | 10 | Yes | ~2,000 | Move to on-demand |
| Google Calendar | 7 | Yes | ~1,400 | Keep auto-load (client scheduling) |
| Vercel | 14 | Yes | ~2,800 | Keep auto-load (deploy pipeline) |

**Total estimated overhead:** ~12,000 tokens per session (schemas + descriptions)

## Findings

1. **Figma MCP (High Impact)**
   - Tools: 20 (design context, Code Connect, metadata, upload, diagrams)
   - Load frequency: Daily during design-to-code handoff sprints
   - Recommendation: **Move to on-demand load**
   - Rationale: Used in bursts (2-3 week sprints); idle 80% of the time

2. **Gmail & Drive (Medium Impact)**
   - Combined tools: 19
   - Load frequency: Ad-hoc (client comms, file links)
   - Recommendation: **Move Drive to on-demand; keep Gmail if ops> uses filters**
   - Rationale: File operations less frequent than messaging

3. **Vercel (Keep)**
   - Tools: 14 (deployments, logs, domains, threads)
   - Load frequency: Post-commit hooks, QA cycles
   - Recommendation: **Keep auto-load**
   - Rationale: CI/CD feedback loop justifies 24/7 access

4. **Google Calendar (Keep)**
   - Tools: 7 (event ops, time suggestion)
   - Load frequency: Sync + scheduling agents
   - Recommendation: **Keep auto-load**
   - Rationale: Lightweight footprint; frequent use in ops automation

## Next Steps (Priority Order)

1. **Move Figma to on-demand:** Edit `.claude/settings.json` to add Figma to `mcpServersOnDemand` array. Saves ~4K tokens per session when sprint is not active.

2. **Move Google Drive to on-demand:** Similar config change. Saves ~2K tokens. Keep Gmail for ops threading.

3. **Monitor Vercel + Calendar overhead:** If deployment frequency drops below 2x/week, revisit auto-load status.

## Configuration Locations

- Global MCP config: Not found in `.mcp.json` or project settings
- Project overrides: `.claude/settings.json` (hooks configured; no MCP array yet)
- Claude app-level: MCPs managed via authenticated Claude.ai session

**Note:** This project uses app-level MCP registration. To enact recommendations, configure `mcpServersOnDemand` in Claude Code settings or request a `.claude/settings.json` mcpServers extension.

## Validation

Token savings estimate (post-Figma + Drive move-to-on-demand):
- Before: ~12,000 tokens/session
- After: ~6,000 tokens/session
- Net savings: ~50% reduction in idle context overhead

Use case: On-demand load adds ~100ms latency first call; negligible for non-interactive tasks.
