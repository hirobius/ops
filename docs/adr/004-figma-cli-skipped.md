# ADR-004: figma-cli Rejected in Favor of Plugin API

**Status:** Accepted (2026-04-30)

## Context
figma-cli (Yolo Mode) offers deterministic CLI-driven Figma asset stamping and export. HDS has an in-house Figma plugin (`figma-agent-plugin/code.js`) that receives LLM-generated JSX and draws it as real components.

## Decision
figma-cli is not adopted. HDS pipeline keeps its own infrastructure: LLM → Bridge → Plugin API (programmatic).

## Rationale
- **Different abstraction.** figma-cli is deterministic stamping; HDS is interactive LLM generation. They serve different workflows.
- **App.asar patching is fragile.** Yolo Mode requires rebuilding Figma's bundled asar, which is unmaintained and breaks on version updates.
- **Plugin API is stable and documented.** Direct plugin code.js execution via the Figma IDE is well-supported and version-stable.
- **LLM agent architecture is simpler.** Bridge handles validation and retry logic; plugin is thin rendering layer.

## Implications
- No new CLI tool adoption
- Figma integration stays plugin-first (user opens HDS plugin, types prompt, watches canvas update)
- Batch-export workflows (if needed) handled by separate fixture/snapshot scripts, not CLI

## Consequences
- Reduced dependency surface (no figma-cli, no yolo mode)
- Smaller risk of Figma version incompatibility
- Plugin remains the single Figma integration point
