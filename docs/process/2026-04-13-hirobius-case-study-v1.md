# Hirobius Case Study Source (V1)

Working source for the Hirobius supporting case study.

Purpose:
- consolidate repo-native evidence into one reusable source
- keep the portfolio page grounded in shipped work and recorded process
- give future copy passes a single place to pull narrative, proof, and artifact priorities from

Status:
- active working doc
- seeded from `TASKS.md`, `docs/SYSTEMS-LOG.md`, `HDS_COMPLIANCE_LOG.md`, `git log`, and relevant archived process/context docs
- intended to evolve alongside [HirobiusCaseStudyPage.tsx](C:/Users/Adrian/Documents/adrian-milsap/src/app/pages/hds/HirobiusCaseStudyPage.tsx)
- retro screenshot planning lives in [2026-04-13-hirobius-retro-capture-plan.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-13-hirobius-retro-capture-plan.md)
- section-by-section proof planning now lives in [2026-04-14-hirobius-evidence-map-v1.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-14-hirobius-evidence-map-v1.md)

## Current Positioning

Hirobius is supporting proof, not the lead portfolio story.

That means the case study should emphasize:
- code-first design-system infrastructure
- process and governance evidence
- machine-readable documentation and AI context
- shell architecture and route/story convergence
- cross-material systems thinking through fabrication and 3D work

That also means the case study should avoid:
- pretending Hirobius is a larger shipped product story than the Microsoft/Xbox work
- relying on abstract design-system language without repository evidence
- inflating incomplete scans or undocumented fabrication/process material

## Narrative Guardrails

These points should stay stable unless the portfolio direction changes:

1. The portfolio itself is part of the proof.
The strongest Hirobius signal is not a separate slide deck. It is that the token pipeline, docs shell, routes, and case-study surfaces all run in the same product.

2. Process matters because it became infrastructure.
The meaningful story is not "I documented this system." It is "I turned the system into something that can report on itself, generate its own context, and stay aligned across human and machine readers."

3. Reporting honesty is part of the craft.
Manifest-backed telemetry, generated `llms.txt`, audit snapshots, and build-status correction all matter because they make the system more truthful, not just more polished.

4. Hirobius supports the spine; it does not replace it.
The page should reinforce senior design-systems credibility without displacing the stronger lead case studies.

## Repo-Native Source Signals

### 1. Backlog and launch-lane signals

From `TASKS.md`:

- the current launch lane includes `portfolio shell visual bug cleanup`, `HDS foundations and components page standardization`, and `WORK page content flow with AI-assisted drafting`
- an active task explicitly calls for using AI to flow content into work pages while keeping claims grounded in shipped work and visible evidence
- another active task explicitly calls for cannibalizing dormant HDS narrative pages into the HDS showcase/work surface instead of leaving strong system-storytelling material stranded in low-traffic pages
- the sprint roadmap frames Hirobius as machine-readable infrastructure via `llms.txt`, AST gatekeeping, schema validation, and Figma parity

Why this matters:
- the Hirobius case study is not a side project to the portfolio build
- the repo already defines this process capture as part of launch work

### 2. Process-memory signals from archived docs

From `docs/archive/process/PROCESS_FULL.md`:

- `2026-03-18 - The docs shell became the portfolio`
- "The portfolio itself became the proof of systems thinking."
- the portfolio hierarchy was reorganized around stronger design-systems evidence
- Hirobius was explicitly reframed as supporting proof
- governance, backlog, audit logging, and process memory became explicit system concerns
- standards became enforcement rather than memory or preference

From `docs/archive/root-context/CLAUDE_HANDOFF_HDS_PORTFOLIO.md`:

- Hirobius was repositioned from "the main docs-native case study" to supporting material
- the shell itself was reshaped to teach the intended portfolio hierarchy
- the reason for the Hirobius page rewrite was narrative honesty

Why this matters:
- the repo already contains the higher-level reasoning behind the Hirobius framing
- this is not a new invention; it is a continuation of an earlier portfolio-architecture decision

### 3. Systems-log evidence

The systems log is the strongest single source for process proof.

Important signals:

- early April entries show the system climbing from lower-integrity states with hundreds of direct violations toward `A (100%)` and `0` direct violations
- `2026-04-04T17:39:33.000Z - Documentation Automation & Sizing Governance`
  - component interfaces and JSDoc were used to generate both human-readable prop tables and machine-readable AI context
  - geometry rules were tightened so spacing tokens no longer leak into width and height decisions
- `2026-04-04T18:02:05.000Z - Library Distribution Boundary`
  - Hirobius was formalized as a distributable system boundary instead of something only the portfolio can consume
- `2026-04-04T18:51:44.963Z - Build Status Telemetry Synchronization`
  - build-status math and AI context were corrected so partial work is reported honestly from the manifest source of truth
- repeated `System Health Synchronization` entries show an ongoing pattern:
  - automated audits regenerate machine-readable artifacts
  - the overview rail, phase tracker, and AI context stay truthful without manual status edits

Why this matters:
- this gives Hirobius a concrete governance/process story
- the story is measurable, dateable, and tied to specific repository operations

### 4. Commit-trail evidence

Most relevant commit themes:

- `refactor(portfolio): streamline shell navigation and active work surfaces`
  - the shell had to be restructured before the portfolio story could read clearly
- `docs: rename work to portfolio and align nav`
  - naming and route hierarchy were treated as portfolio strategy, not mere relabeling
- `feat: auto-generate public/hds-manifest.json and public/llms.txt`
  - the system started generating public machine-readable context from live sources
- `feat: AI-readable pipeline, auto-registry sync, and focus ring hardening`
  - registry sync, llms generation, and handoff automation became first-class
- `Automate storefront component documentation`
  - component documentation stopped being manually curated
- `Prove automated storefront governance`
  - governance moved from claim to verified system behavior

Why this matters:
- the case study can cite repository evolution through real milestones rather than generalized "iteration"

## Safe Claims We Can Make Now

These claims are strongly supported by the current repo:

- Hirobius is a code-first design system driven by a single token source
- the documentation layer is not separate from the implementation layer; it is generated and synchronized from live system data
- the portfolio shell and the design-system shell were intentionally converged so the system itself becomes portfolio evidence
- governance and reporting accuracy are first-class concerns in the project, not afterthoughts
- machine-readable context for agents is part of the system architecture
- Hirobius demonstrates systems thinking across code, docs, and broader making practice

## Claims To Avoid Until More Evidence Is Curated

- any claim that Hirobius is as mature or as externally proven as the Microsoft/Xbox work
- any fabrication or physical-product claim that does not have curated supporting assets in the portfolio
- any "full process" claim that depends on oversized documentation samples we have not yet extracted properly
- any claim that implies finished Figma parity or complete reverse-sync if that work is still roadmap material

## V1 Case-Study Copy Blocks

These are intentionally short and reusable. They can be pasted into the page, expanded into a deck, or broken into captions later.

### Problem

Hirobius needed to become more than a private design system or an internal HDS route. For it to help the portfolio, it needed to explain what the system proves, how it was built in public, and why that process matters.

### Role & Constraints

I am the designer, system author, and implementer on Hirobius. That means the visual language, token model, docs framing, shell architecture, and production code all live inside the same repo. The key constraint is honesty: the case study has to stay grounded in what is already live and inspectable.

### Process

The portfolio shell and HDS docs became the proving ground first. From there, the work shifted toward generated system context, manifest-backed reporting, stricter audits, and a documentation layer that behaves like infrastructure instead of static explanation. The case-study framing is now being pulled from those shipped changes rather than invented outside them.

### The Cascade Effect

In Hirobius, a naming decision is rarely just a naming decision. Token choices affect generated CSS variables, TypeScript outputs, docs tables, AI-readable context, route discoverability, and how the portfolio story stays aligned with the system underneath it.

### Dev Handoff

The strongest handoff signal is that the system explains itself through generated artifacts. JSDoc and interfaces feed prop tables. Token sources feed manifests and `llms.txt`. Health telemetry stays synced through scripts instead of manual reporting. The handoff is the system behavior, not just a PDF of specs.

### Outcome / Impact

Hirobius now reads more like a productized system and less like a personal experiment. The portfolio can show a live token pipeline, machine-readable documentation, truthful health reporting, and a shell that reflects the system it documents.

### Reflection

The strongest current evidence is operational: automation, synchronization, route restructuring, and governance. The next level of the case study will come from curating more artifact-level proof so the process story can show exact before/after moments, not just the architecture behind them.

## Pull Quotes

These are good candidates for on-page callouts, captions, or deck headers:

- "The portfolio itself became the proof of systems thinking."
- "The best Hirobius handoff is not more detached explanation. It is a tighter path into the real system."
- "Reporting honesty mattered as much as visual polish."
- "Hirobius became stronger when governance stopped depending on memory."
- "The docs did not just describe the system. They became part of its infrastructure."

## Artifact Priorities For The Next Pass

Highest-value evidence to add next:

1. Telemetry snapshot pair
- one early systems-log snapshot showing high direct violations
- one later snapshot showing `A (100%)` and `0` direct violations

2. Machine-readable pipeline proof
- screenshot or excerpt of generated `llms.txt`
- screenshot or excerpt of `system.manifest.json` / component API generation

3. Shell restructuring proof
- route/nav before/after
- the moment Hirobius became reachable as supporting proof instead of hidden or over-emphasized

4. Documentation automation proof
- prop-table generation
- storefront doc template standardization

5. Fabrication / 3D support strip
- a small, disciplined visual strip that supports "same thinking, different materials" without turning the page into a broad creative archive

## Update Notes

When extending this doc:

- prefer dated repo-native evidence over fresh interpretation
- append new source signals under the relevant section rather than rewriting history
- keep "safe claims" and "claims to avoid" current
- update the page copy only after the source doc reflects the new evidence

## Primary Source Files

- [TASKS.md](C:/Users/Adrian/Documents/adrian-milsap/TASKS.md)
- [docs/SYSTEMS-LOG.md](C:/Users/Adrian/Documents/adrian-milsap/docs/SYSTEMS-LOG.md)
- [HDS_COMPLIANCE_LOG.md](C:/Users/Adrian/Documents/adrian-milsap/HDS_COMPLIANCE_LOG.md)
- [docs/archive/process/PROCESS_FULL.md](C:/Users/Adrian/Documents/adrian-milsap/docs/archive/process/PROCESS_FULL.md)
- [docs/archive/root-context/CLAUDE_HANDOFF_HDS_PORTFOLIO.md](C:/Users/Adrian/Documents/adrian-milsap/docs/archive/root-context/CLAUDE_HANDOFF_HDS_PORTFOLIO.md)
- [HirobiusCaseStudyPage.tsx](C:/Users/Adrian/Documents/adrian-milsap/src/app/pages/hds/HirobiusCaseStudyPage.tsx)
