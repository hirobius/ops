# ADR-003: DTCG Tokens Remain Authoritative Source

**Status:** Accepted (2026-04-30)

## Context
HDS Token system uses `hirobius.tokens.json` in DTCG format. Post-Tailwind reintegration, there's potential confusion about which layer is canonical when multiple consumers exist (CSS variables, Tailwind config, Figma Variables, TypeScript constants).

## Decision
`hirobius.tokens.json` (DTCG format) is the single source of truth. All downstream formats (CSS variables, Tailwind config, TS constants) are generated via `scripts/build-tokens.mjs` and are throwaway artifacts.

## Rationale
- **DTCG is platform-agnostic.** It's a specification, not tied to any single tool.
- **Design system portability.** If HDS ever needs to support non-web platforms, DTCG format survives. Tailwind config does not.
- **Human-readable at scale.** DTCG JSON is easier to diff than generated CSS or Tailwind config.
- **Manifest projections depend on tokens.json.** The manifest validation and token-to-component binding both read token paths from the JSON source.

## Implications
- No Style Dictionary. Custom `build-tokens.mjs` emitter produces all derivatives.
- Figma Variables sync (p6-4) reads from tokens.json, not the reverse.
- Token mutations (rename, value change) happen in tokens.json first; all else regenerates.

## Consequences
- Single reconciliation loop instead of bidirectional sync complexity
- Simpler CI/CD (one source, N consumers, no conflict resolution)
- Custom emitter is ~200 lines; Style Dictionary overhead avoidance is real
