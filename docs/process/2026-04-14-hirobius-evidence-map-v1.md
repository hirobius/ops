# Hirobius Evidence Map (V1)

Section-by-section evidence plan for turning the Hirobius supporting case study into a proof-led page.

Purpose:
- map each live page section to concrete repo-native proof
- define what kind of artifact belongs in each block before we start capturing images
- keep the case study grounded in inspectable evidence instead of adding more abstract prose
- avoid overlap with the separate Mobius 3D work by keeping this pass focused on Hirobius process proof

Status:
- active planning doc
- intended to guide the next implementation pass on [HirobiusCaseStudyPage.tsx](C:/Users/Adrian/Documents/adrian-milsap/src/app/pages/hds/HirobiusCaseStudyPage.tsx)
- pairs with [2026-04-13-hirobius-case-study-v1.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-13-hirobius-case-study-v1.md), [2026-04-13-hirobius-case-study-copy-v1.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-13-hirobius-case-study-copy-v1.md), and [2026-04-13-hirobius-retro-capture-plan.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-13-hirobius-retro-capture-plan.md)

## Working Rule

Each major section on the Hirobius page should eventually have at least one of these:
- a UI screenshot
- a generated artifact excerpt
- a dated systems-log or task snapshot
- a commit-to-output pairing
- a small support strip that strengthens the "same thinking, different materials" claim

If a section cannot point to one of those, it is probably still too narrative-heavy.

## Evidence Priorities

### Priority 1: Add first

- token pipeline proof
- governance / telemetry proof
- shell + docs convergence proof

These three make the page feel materially grounded the fastest.

### Priority 2: Add next

- commit-to-artifact pairings
- documentation automation proof
- route / nav evolution proof

### Priority 3: Add later

- fabrication / 3D support strip
- retro progression frames
- richer before / after comparisons

## Section Map

### 1. Hero

Current job:
- establish Hirobius as supporting systems proof
- make the infrastructure claim immediately legible

Best artifact:
- one clean shell screenshot of `/portfolio/hirobius` with left nav visible

Why this artifact belongs here:
- it proves the page is real, routeable, and integrated into the portfolio shell

Source:
- current app state on `http://localhost:5174/portfolio/hirobius`

Recommended file:
- `public/assets/hirobius/process/hero-shell-hirobius-case-study.png`

Implementation note:
- this should sit near the top as a framing image, not lower as an afterthought

### 2. Problem

Current job:
- explain why Hirobius had to become more than a private system or internal route

Best artifact:
- shell/navigation before-after pair showing Hirobius as hidden / less legible versus reachable / correctly framed

Why this artifact belongs here:
- the problem was partly architectural and informational, not just editorial

Source candidates:
- route and nav changes in [src/app/routes.tsx](C:/Users/Adrian/Documents/adrian-milsap/src/app/routes.tsx)
- shell/nav changes in [src/app/pages/hds/HDSLayout.tsx](C:/Users/Adrian/Documents/adrian-milsap/src/app/pages/hds/HDSLayout.tsx)
- relevant commits from the retro plan

Recommended files:
- `public/assets/hirobius/process/problem-nav-before.png`
- `public/assets/hirobius/process/problem-nav-after.png`

Implementation note:
- if a visual before-after is too expensive immediately, use a small commit-and-route callout first

### 3. Role & Constraints

Current job:
- show that Hirobius is governed and intentionally narrow

Best artifact:
- compact "constraint strip" rather than a big screenshot

Possible contents:
- one-accent rule
- pure-CSS theming
- token-first styling
- 4px grid
- sharp button corners

Source candidates:
- [DESIGN.md](C:/Users/Adrian/Documents/adrian-milsap/DESIGN.md)
- [hirobius.tokens.json](C:/Users/Adrian/Documents/adrian-milsap/hirobius.tokens.json)
- current HDS tokens docs

Recommended file strategy:
- likely no image needed first
- this can be an in-page editorial block derived from source text and token names

Implementation note:
- keep this mostly textual unless we find a highly disciplined visual treatment

### 4. Process

Current job:
- show the sequence from shell shift to token pipeline to generated docs to governance

Best artifact:
- one horizontal process strip with four proof chips

Four chips:
- shell became product surface
- token source compiles to outputs
- docs became generated system layer
- governance became measurable

Source candidates:
- [2026-04-13-hirobius-case-study-v1.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-13-hirobius-case-study-v1.md)
- [docs/SYSTEMS-LOG.md](C:/Users/Adrian/Documents/adrian-milsap/docs/SYSTEMS-LOG.md)
- [TASKS.md](C:/Users/Adrian/Documents/adrian-milsap/TASKS.md)

Recommended implementation:
- start as a native UI module in the page
- do not wait for screenshots to improve this section

### 5. Process Signals Already In The Repo

Current job:
- prove that the case-study work already existed in backlog and roadmap form

Best artifact:
- one cropped backlog/task excerpt and one roadmap excerpt

Why this artifact belongs here:
- it shows the case-study capture is not retroactive storytelling invented after the fact

Source candidates:
- [TASKS.md](C:/Users/Adrian/Documents/adrian-milsap/TASKS.md)
- [BACKLOG.md](C:/Users/Adrian/Documents/adrian-milsap/BACKLOG.md) if needed

Recommended files:
- `public/assets/hirobius/process/signals-tasks-launch-lane.png`
- `public/assets/hirobius/process/signals-machine-readable-roadmap.png`

Implementation note:
- if we only use one crop first, prioritize the task that explicitly calls for pulling HDS narrative pages into portfolio evidence

### 6. The Cascade Effect

Current job:
- show that Hirobius decisions propagate through multiple layers

Best artifact:
- one pipeline diagram or one structured proof matrix

Best content:
- token file -> generated CSS vars -> generated TS -> docs references -> live shell

Source candidates:
- [hirobius.tokens.json](C:/Users/Adrian/Documents/adrian-milsap/hirobius.tokens.json)
- [src/styles/tokens.css](C:/Users/Adrian/Documents/adrian-milsap/src/styles/tokens.css)
- [src/app/design-system/generated-tokens.ts](C:/Users/Adrian/Documents/adrian-milsap/src/app/design-system/generated-tokens.ts)
- [public/hds-manifest.json](C:/Users/Adrian/Documents/adrian-milsap/public/hds-manifest.json)

Recommended file:
- `public/assets/hirobius/process/cascade-token-pipeline-diagram.png`

Implementation note:
- this can begin as an in-page proof module before it becomes a polished diagram

### 7. What The Repo History Proves

Current job:
- anchor the case study in dated evidence

Best artifact:
- telemetry snapshot pair plus a systems-log excerpt

Must-have pair:
- early state showing high direct violations
- later state showing `A (100%)` and `0` direct violations

Source:
- [docs/SYSTEMS-LOG.md](C:/Users/Adrian/Documents/adrian-milsap/docs/SYSTEMS-LOG.md)

Recommended files:
- `public/assets/hirobius/process/history-early-violations.png`
- `public/assets/hirobius/process/history-a100-zero-violations.png`
- `public/assets/hirobius/process/history-systems-log-proof.png`

Implementation note:
- this is the strongest first screenshot category after the hero

### 8. Dev Handoff

Current job:
- show that Hirobius explains itself through generated outputs and synchronized references

Best artifact:
- two-up proof pair

Pair option A:
- `llms.txt` excerpt
- `public/hds-manifest.json` or component API excerpt

Pair option B:
- generated prop table screenshot
- live docs page screenshot showing the same component surface

Source candidates:
- [public/llms.txt](C:/Users/Adrian/Documents/adrian-milsap/public/llms.txt)
- [public/hds-manifest.json](C:/Users/Adrian/Documents/adrian-milsap/public/hds-manifest.json)
- [src/app/data/component-api.json](C:/Users/Adrian/Documents/adrian-milsap/src/app/data/component-api.json)

Recommended files:
- `public/assets/hirobius/process/handoff-llms-context.png`
- `public/assets/hirobius/process/handoff-manifest-proof.png`
- `public/assets/hirobius/process/handoff-generated-props.png`

Implementation note:
- this section should eventually be one of the clearest examples of "the handoff is the system behavior"

### 9. Commit Trail

Current job:
- connect specific repo milestones to visible outputs

Best artifact:
- commit-to-artifact pairing list

Structure:
- commit hash / label
- what changed
- what visible proof we can show

Best first pairings:
- shell/nav restructure -> shell screenshot
- generated public manifest / llms -> output excerpt
- docs automation -> docs page screenshot

Source:
- `git log`
- the files and routes those commits affected

Implementation note:
- this can stay text-first until the proof images exist

### 10. Outcome / Impact

Current job:
- turn the process into concrete portfolio outcomes

Best artifact:
- three-card proof strip with one screenshot or excerpt per card

Card themes:
- live design-system surface
- code-first proof
- different proof from flagship work

Source candidates:
- hero shell screenshot
- token pipeline excerpt
- generated docs or telemetry proof

Implementation note:
- reuse existing evidence assets instead of inventing a new visual category here

### 11. Reflection

Current job:
- show that the story is intentionally scoped and still growing

Best artifact:
- no image required first

Why:
- this section is strongest when it stays disciplined and honest

Implementation note:
- if we add anything later, use a tiny "next evidence to extract" strip rather than a large visual

### 12. Useful Entry Points

Current job:
- route people into the live system

Best artifact:
- no extra artifact needed

Why:
- the cards themselves are already acting as the bridge into inspectable proof

Implementation note:
- keep these links current as the page evolves

### 13. Audit Log

Current job:
- preserve the repo's editorial/audit framing

Best artifact:
- existing interactive audit log is sufficient for now

Implementation note:
- if we revise this later, do it with care so it does not compete with the systems-log proof above

### 14. Evidence Still To Pull Forward

Current job:
- act as the honest backlog for future enrichment

Best artifact:
- eventually convert this into a tighter "next artifact queue"

Implementation note:
- once the first three evidence modules land, this section should shrink and become more specific

## First Three Proof Modules To Build

These are the next implementation targets for the live page.

### Module 1: Token Pipeline Proof

Goal:
- make the code-first system visible in one glance

Contents:
- token source
- generated CSS vars
- generated TS
- live docs / shell consumption

Can start as:
- a styled in-page sequence block

### Module 2: Governance Snapshot Pair

Goal:
- prove the measurable improvement arc

Contents:
- early systems-log state
- current systems-log state
- one caption explaining why reporting honesty matters

Can start as:
- two images with one short editorial caption

### Module 3: Shell + Docs Convergence

Goal:
- show the portfolio itself becoming the proof surface

Contents:
- one shell screenshot
- one route/nav or docs screenshot
- one caption tying them together

Can start as:
- a two-up image block under the hero or process section

## Suggested Capture / Build Order

1. Capture the current hero shell screenshot
2. Capture the systems-log pair
3. Capture one machine-readable handoff pair
4. Build the token pipeline proof as a native page module
5. Add route/nav or backlog crops
6. Revisit fabrication / 3D support only after the first proof layer is in place

## Asset Naming Starter Set

When we begin collecting real assets, start with:

- `hero-shell-hirobius-case-study.png`
- `history-early-violations.png`
- `history-a100-zero-violations.png`
- `handoff-llms-context.png`
- `handoff-manifest-proof.png`
- `signals-tasks-launch-lane.png`
- `problem-nav-before.png`
- `problem-nav-after.png`

Final home:
- `public/assets/hirobius/process/`

## Out Of Scope For This Pass

To avoid crossing wires with the separate 3D logo effort, do not treat these as Hirobius evidence work right now:
- Mobius component implementation changes
- Mobius scene dependencies
- polishing the separate logo-evolution branch

If 3D material appears in Hirobius later, it should arrive as curated supporting evidence, not as active implementation overlap.

## Immediate Next Step

Use this doc to build the first live evidence module.

Best next implementation:
- add a token pipeline proof block to [HirobiusCaseStudyPage.tsx](C:/Users/Adrian/Documents/adrian-milsap/src/app/pages/hds/HirobiusCaseStudyPage.tsx)
- keep it native to the page before we start dropping in screenshots
