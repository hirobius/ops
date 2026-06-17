# Hirobius Retro Capture Plan

Plan for creating progressive screenshots of the Hirobius app/shell retroactively.

Purpose:
- capture the build story as a sequence of app states
- create a still-image set that can later become a GIF, deck strip, or interactive timeline
- keep the captures repeatable and tied to real repo milestones instead of vague "early vs late" visuals

Status:
- planning doc only
- no capture automation committed yet
- intended to pair with [2026-04-13-hirobius-case-study-v1.md](C:/Users/Adrian/Documents/adrian-milsap/docs/process/2026-04-13-hirobius-case-study-v1.md)

## What We Are Actually Capturing

Not:
- random polished screenshots of the current site
- generic design-system beauty shots
- code editor screenshots pretending to be product proof

Yes:
- discrete app/shell milestones that show how the portfolio and HDS surface evolved
- a progressive sequence where each frame reflects a real architectural or governance shift
- captures that can be read in order, almost like release stills

## Best Capture Strategy

Use two capture tracks.

### Track A: App-state screenshots

These are the main frames for the retro build story.

They should show:
- shell structure
- route hierarchy
- portfolio-vs-docs positioning
- system-health / machine-readable / token-surface maturity
- the Hirobius case-study surface itself

### Track B: Supporting evidence stills

These are not the main GIF frames, but they support the page or a future deck.

They should show:
- `llms.txt`
- `system.manifest.json`
- systems-log telemetry snapshots
- generated prop tables / docs automation proof

These can live as secondary assets on the page even if the GIF stays app-only.

## Recommendation: Reconstructed Milestones, Not Pure Historical Exactness

For retroactive capture, there are two possible methods:

1. Exact historical capture from old commits
- checkout/worktree specific commits
- run the app at that point
- capture the real historical UI

2. Reconstructed milestone capture on a modern branch
- recreate the important milestone states with current tooling and current route stability
- keep each frame faithful to the milestone narrative, even if it is not byte-for-byte historical

Recommendation:
- use a hybrid approach
- exact historical capture when the old route still boots cleanly
- reconstructed capture when older states are too brittle or too expensive to stabilize

Reason:
- the goal is a truthful process story, not archaeology for its own sake
- the repo already has enough process evidence to justify milestone reconstruction where needed

## Primary Milestones To Capture

These are the best current candidates based on repo history and archived process docs.

### 1. Docs shell becomes the portfolio

Story:
- `/hds` stops behaving like a sidecar reference and becomes the portfolio-facing shell

Why it matters:
- this is the foundational "the portfolio itself became the proof" moment

Likely source:
- archived process memory around 2026-03-18

Ideal frame:
- left rail + overview shell
- enough of the hero/content area to show "docs shell as product surface"

### 2. Portfolio hierarchy becomes evidence-led

Story:
- stronger case studies lead
- Hirobius is repositioned as supporting proof

Why it matters:
- this is a content-strategy and information-architecture milestone, not just visual polish

Likely source:
- archived process/context docs
- shell/nav changes

Ideal frame:
- sidebar or home grid with the hierarchy clearly visible

### 3. Shell/navigation restructure

Story:
- work becomes portfolio
- shell routes and active surfaces are cleaned up

Why it matters:
- this is where the site starts reading more like a productized portfolio

Likely commits:
- `f82830c refactor(portfolio): streamline shell navigation and active work surfaces`
- `00205b5 docs: rename work to portfolio and align nav`

Ideal frame:
- nav and shell chrome in a stable state
- maybe one before and one after

### 4. Machine-readable pipeline appears

Story:
- generated `public/hds-manifest.json`
- generated `public/llms.txt`
- registry and AI-readable context become first-class

Why it matters:
- this is one of the clearest Hirobius differentiators

Likely commits:
- `b20124f feat: auto-generate public/hds-manifest.json and public/llms.txt`
- `8182e3c feat: AI-readable pipeline, auto-registry sync, and focus ring hardening`

Ideal frame:
- app frame: Overview / Tokens / docs shell showing machine-readable maturity
- support still: `llms.txt` excerpt or manifest structure

### 5. Docs automation / storefront governance

Story:
- prop tables and docs surfaces become generated
- governance becomes verifiable

Why it matters:
- shows Hirobius as a system that can inspect and document itself

Likely commits:
- `340d0a2 Automate storefront component documentation`
- `a571e32 Prove automated storefront governance`

Ideal frame:
- component docs page with generated structure visible
- support still: systems-log or generated component API evidence

### 6. Current Hirobius supporting case-study state

Story:
- Hirobius becomes reachable, nav-visible, and framed as supporting proof

Why it matters:
- this is the present-day landing point for the retro sequence

Likely source:
- current branch state

Ideal frame:
- `/portfolio/hirobius`
- left nav visible with `Hirobius`

## Capture Format Recommendations

### For the main progression sequence

Use one fixed format first:
- desktop only
- light mode only
- viewport capture, not full-page
- same crop every time

Recommended starting capture:
- viewport: `1440 x 900` or `1280 x 800`
- route-first framing with visible left rail
- browser chrome excluded if possible

Reason:
- if the goal is a future GIF, consistency matters more than showing every responsive mode

### For supporting stills

Can vary as needed:
- code excerpts
- systems log crop
- manifest or llms excerpt
- maybe one mobile shot later if it adds something real

## Capture Rules

To keep the sequence usable:

1. One camera angle
- same viewport
- same browser zoom
- same shell framing
- same theme

2. Minimal motion noise
- wait for route settle
- let animations finish before capture
- prefer a stable state over capturing while transitions are mid-flight

3. Stable content density
- avoid routes whose copy changed wildly unless the change itself is the story
- prioritize shell, structure, and system surfaces

4. App-first frames
- use repo/docs/code stills only as supporting panels, not the main progression

5. Keep filenames chronological
- do not name by route alone
- name by milestone order

## Proposed File Naming

Main sequence:

- `step-01-docs-shell-becomes-portfolio.png`
- `step-02-evidence-led-hierarchy.png`
- `step-03-shell-nav-restructure.png`
- `step-04-machine-readable-pipeline.png`
- `step-05-storefront-docs-automation.png`
- `step-06-hirobius-supporting-case-study.png`

Support stills:

- `support-01-systems-log-early-violations.png`
- `support-02-systems-log-a100-zero-violations.png`
- `support-03-llms-generated-context.png`
- `support-04-system-manifest-generated.png`
- `support-05-component-api-generated-props.png`

## Asset Workflow Recommendation

Use the repo's existing asset intake flow.

Suggested staging:
- drop raw captures into `public/assets/_incoming/hirobius-retro/` locally as working files

Suggested final destination:
- `public/assets/hirobius/process/`

Suggested final naming:
- keep the chronological step naming above

If we decide to surface them on a portfolio page with slot mapping:
- map them through explicit slots rather than hardcoding arbitrary file paths into page markup

## Best Tooling Path

### Phase 1: Manual capture for shot design

Use the live dev server and capture a few frames manually first.

Why:
- fastest way to settle framing
- easier to decide whether the sequence wants a full-shell crop, a narrower content crop, or both

### Phase 2: Automate once framing is locked

Use Playwright after the shot language is settled.

The repo already has:
- `tests/visual.spec.ts`
- Playwright config
- stable route capture patterns

Best next implementation later:
- add a dedicated retro-capture spec or script
- keep it separate from regression baselines

Suggested future file:
- `tests/retro-hirobius-capture.spec.ts`

That script should:
- set one fixed viewport
- visit each target route/state
- wait for `networkidle`
- wait an additional settle timeout
- capture named screenshots into a dedicated output folder

## Capture Order

When we actually execute this, use this order:

1. Confirm the fixed frame size and crop on the current branch
2. Capture the current final-state Hirobius frame first
3. Capture the current shell/home/nav frame
4. Then move backward into milestone recreations or historical worktrees
5. Capture support stills last

Why:
- having the final frame first helps keep all earlier captures aligned to the same visual destination

## Historical Commit Candidates

These are the current best anchors for retro capture work:

- `f82830c` - shell/nav/work-surface restructure
- `00205b5` - work-to-portfolio rename and nav alignment
- `b20124f` - generated public manifest + llms outputs
- `8182e3c` - AI-readable pipeline and registry sync
- `340d0a2` - storefront component documentation automation
- `a571e32` - automated storefront governance proof

These should be treated as milestone candidates, not mandatory exact-capture commits.

## Open Questions To Resolve When We Start Capturing

- do we want the GIF to show the home/overview shell evolving, or Hirobius-specific routes evolving?
- do we want a clean app-only sequence, or occasional code/log support inserts?
- do we want one final desktop-only sequence, or a second mobile strip later?
- do we want the final page to show these as a static timeline first before turning them into a GIF?

## Immediate Next Step

Before any historical capture:

- settle one reference frame on the current branch
- decide the exact crop
- create the step list as a real shot checklist

That will make the retro pass much faster and keep us from collecting a folder full of pretty but unusable screenshots.
