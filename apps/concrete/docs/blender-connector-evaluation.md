# Concrete Creations — Claude+Blender Connector Evaluation

> Task: 12u-cc-blender-claude-product-renders  
> Status: SPEC (T4 strategic — no code until Adrian decides)  
> Date: 2026-05-06  
> Evaluator: frontend-eng (autonomous build agent)

---

## 1. Executive Summary

The **blender-mcp** connector (community standard, 21K+ stars, referenced in Anthropic demo content) lets Claude drive Blender via the Model Context Protocol: scene setup, lighting, material changes, camera angles, and render triggers through natural language.

**Verdict: Viable for supplementary renders, risky as primary catalog imagery.**

For Concrete Creations — a handmade brand where every cast differs — the strategic question is not "can the connector work?" but "where do renders add value without eroding authenticity?" This document evaluates three use cases, proposes a hybrid strategy, and surfaces the decision points Adrian must make before any implementation.

---

## 2. Connector Overview

### 2.1 What it is
- **Project:** `ahujasid/blender-mcp` on GitHub (PyPI: `blender-mcp`, current v1.5.5)
- **Architecture:** Two-part system
  1. **Blender addon (`addon.py`)** — Socket server inside Blender listening on localhost:9876
  2. **MCP server (`uvx blender-mcp`)** — Bridges Claude Desktop / Cursor / VS Code to the addon
- **Not actually "official" from Anthropic** — it is the de-facto standard connector demonstrated in Anthropic content and widely referred to as "Claude's Blender connector."

### 2.2 Core capabilities relevant to product visualization
| Capability | Relevance to CC |
|---|---|
| Object manipulation (create, modify, delete) | High — adjust forms, duplicates |
| Material & color control | **Very high** — variant previews without re-shooting |
| Lighting & camera setup | **Very high** — consistent studio lighting for heroes |
| Scene inspection & screenshots | High — verify composition before render |
| Arbitrary Python execution | High — batch render, export, automate |
| Poly Haven HDRIs / assets | Medium — lifestyle scene backgrounds |
| Hyper3D Rodin (AI 3D gen) | Low-Medium — not needed if we model/scan our own forms |
| Sketchfab model search | Low — external assets not on-brand |
| Viewport screenshots | High — rapid iteration without full render |

### 2.3 Installation footprint
- Requires Blender 3.0+, Python 3.10+, `uv` package manager
- Addon install per Blender instance
- MCP server configured in Claude Desktop / Cursor / `claude mcp add`
- Can run on remote host via `BLENDER_HOST` / `BLENDER_PORT` env vars

---

## 3. Use-Case Evaluation

### 3.1 Consistent product hero renders as catalog grows
**Feasibility: Medium — blocked on 3D model creation.**

The connector can position lights, set cameras, and trigger Cycles/Eevee renders repeatably. *But* it needs a base 3D mesh of each Form. Our concrete pieces are hand-cast; no CAD files exist.

**Options to get base meshes:**
| Method | Effort | Fidelity | Notes |
|---|---|---|---|
| Photogrammetry (phone + RealityScan / Meshroom) | 2–4 hrs per Form | High | Captures real surface texture; best authenticity |
| Manual Blender modeling from photos | 4–8 hrs per Form | Medium-High | Artistic interpretation; risk of "too perfect" |
| AI 3D gen (Hyper3D Rodin, Hunyuan3D) | 15 min + cleanup | Variable | Fast but generic; may not match actual Form proportions |

**Recommendation:** If we pursue hero renders, photogrammetry of one representative cast per Form is the only method that preserves brand truth.

### 3.2 Colorway / material variant previews without re-shooting
**Feasibility: High — the connector's strongest fit.**

Once a base mesh exists, changing materials is trivial via natural language:
- "Apply a polished sealed finish instead of matte"
- "Tint the concrete warm grey"
- "Add a terrazzo aggregate texture"

This unlocks:
- Pre-order pages for uncast colorways
- A/B testing material preference without physical prototypes
- Social content showing "what if" variants

**Caveat:** Variants must be labeled clearly as *digital previews* so customers understand the final handmade piece will differ.

### 3.3 Integration with 12u-cc-handmade-asset-pipeline
**Feasibility: Medium — needs schema extension.**

The current `products.json` schema (see `apps/concrete/data/products.json`) uses:
```json
{
  "images": ["/products/form-01/01.jpg", ...],
  "primaryImage": "/products/form-01/01.jpg"
}
```

**Proposed minimal schema additions:**
```json
{
  "images": [...],
  "primaryImage": "...",
  "renderVariants": [
    {
      "id": "form-01-warm-grey",
      "label": "Warm Grey (preview)",
      "source": "render",
      "images": ["/renders/form-01/warm-grey/01.webp"],
      "primaryImage": "/renders/form-01/warm-grey/01.webp",
      "materialDescription": "Portland cement with warm grey pigment, sealed matte"
    }
  ],
  "varianceDescription": "Each cast is unique. Surface texture, air pockets, and color density vary. Photos show the actual piece you will receive; renders show possible variations."
}
```

**Pipeline integration point:**
1. `scripts/process-product-asset.mjs` (from parent task `12u-cc-handmade-asset-pipeline`) accepts a new `--source render` flag
2. Blender batch render → PNG export → script converts to WebP at 400/800/1600 widths
3. Output lands in `public/renders/<slug>/<variant>/`
4. Script updates `products.json` `renderVariants` array

---

## 4. Render vs Photo Strategy

### 4.1 The brand tension
Concrete Creations' value proposition is *handmade in Spokane, small editions, natural variance*. A perfectly smooth CGI render contradicts that story. The customer must still feel the human touch.

### 4.2 Three strategies evaluated

#### Strategy A: Photo-primary, render-supplement (RECOMMENDED)
- **Hero shots:** Real photos of the actual piece for sale (existing plan: 3 angles per Form)
- **Variants:** Renders for colorways / finishes not yet physically cast
- **Lifestyle scenes:** Renders for contextual placement (shelf, desk, garden) using Poly Haven HDRIs
- **Social content:** Renders as "concept" or "process" posts, never sold as product photos

**Pros:** Authenticity preserved; renders add scale where photos can't.  
**Cons:** Maintains two asset pipelines; customer must distinguish photo from render.

#### Strategy B: Render-primary (NOT RECOMMENDED)
- All catalog imagery is CGI; photos only used for process / behind-the-scenes content

**Pros:** Fastest scaling; perfectly consistent lighting across 100+ SKUs.  
**Cons:** Erodes handmade brand; customer trust drops if they discover the product photo wasn't real.

#### Strategy C: Hybrid per-product
- Available stock: real photos of the exact piece
- Pre-orders / backorders: renders with "ships in 6–8 weeks, each piece unique" disclaimer

**Pros:** Matches inventory state to asset type.  
**Cons:** Most complex pipeline; requires per-piece photo tracking.

### 4.3 Decision matrix
| Question | If YES | If NO |
|---|---|---|
| Do we have 3D meshes of Forms? | Renders viable for all use cases | Blocked; invest in photogrammetry first |
| Is the primary sales channel direct (hirobius.studio)? | Authenticity matters more; photo-primary | Wholesale / third-party may accept render-primary |
| Will we offer colorway pre-orders? | Render variants essential | Render value drops to lifestyle/social only |
| Can we label renders as "digital preview"? | Hybrid strategy is safe | Risk of deceptive imagery claims |

---

## 5. Downstream Impact

### 5.1 12u-cc-ai-content-repurpose-pipeline
Renders become a *new content source* for the Hormozi-model pipeline:
- Long-form: screen recording of Claude+Blender connector building a scene
- Clips: "Watch the lighting change" / "Same Form, three finishes"
- Short-form: Quick-cut material swaps
- Static: Render frames → carousel posts showing variant grid

**Advantage:** A single Blender scene generates 10+ social assets without a physical reshoot.

### 5.2 12u-cc-product-catalog-data-model
The `renderVariants` array (§3.3) feeds directly into the catalog data model. If Stripe products eventually support variant images, the `renderVariants.primaryImage` becomes the Stripe product image for that variant.

---

## 6. Implementation Path (if Adrian selects Strategy A)

| Phase | Work | Owner | Effort |
|---|---|---|---|
| 0 | **Decision** — Adrian confirms render strategy & photogrammetry budget | Adrian | — |
| 1 | **Mesh acquisition** — Photogrammetry scan of Form 01 representative cast | Adrian / freelancer | 1 day |
| 2 | **Connector setup** — Install blender-mcp addon + MCP server in Claude Desktop | frontend-eng | 2 hrs |
| 3 | **Scene template** — Build reusable Blender file: lighting rig, camera positions, backdrop matching HDS tokens | frontend-eng | 4 hrs |
| 4 | **Variant pilot** — Generate 3 material variants for Form 01 via natural language prompts | frontend-eng + Claude | 2 hrs |
| 5 | **Pipeline wiring** — Extend `scripts/process-product-asset.mjs` with `--source render` | frontend-eng | 4 hrs |
| 6 | **Schema update** — Add `renderVariants` to `products.json`, update `src/lib/products.ts` type | frontend-eng | 1 hr |
| 7 | **UI treatment** — ProductPage renders "Digital preview" badge on render variants | frontend-eng | 2 hrs |

**Total build effort (post-decision): ~2 days.**

---

## 7. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Authenticity erosion** | High | Never use renders as primary image for in-stock pieces; always label renders |
| **Photogrammetry cost / quality** | Medium | Start with free Meshroom or phone-based RealityScan; upgrade to structured-light scan only if needed |
| **Connector is community, not Anthropic-supported** | Medium | Lock to a known-good version (v1.5.5); fork if critical; connector is MIT-licensed |
| **Render-Photo mismatch (customer expectation)** | High | `varianceDescription` field on every product; explicit "each piece is unique" copy |
| **Pipeline complexity** | Low | Keep renders in separate `public/renders/` tree; don't interleave with photos |
| **Blender hardware requirements** | Low | Eevee renders are fast on modest GPU; Cycles only if photorealism is required |

---

## 8. Decision Points for Adrian

Before this task moves from SPEC to BUILD, Adrian must decide:

1. **Strategy selection:** A (photo-primary), B (render-primary), or C (hybrid per-product)?  
   → *Default recommendation: A*

2. **Mesh acquisition:** Will you photogrammetry-scan at least Form 01?  
   → *Without a base mesh, no render pipeline is possible.*

3. **Variant scope:** Which material/colorway variations are worth previewing?  
   → *Examples: warm grey, charcoal, terrazzo, polished vs matte sealed*

4. **Labeling policy:** How do we disclose renders on the product page?  
   → *Suggestion: "Digital preview — actual piece will vary" badge*

5. **Launch priority:** Is this pre-launch (blocks hirobius.studio go-live) or post-launch?  
   → *Renders are a growth accelerant, not a launch blocker.*

---

## 9. References

- blender-mcp GitHub: `https://github.com/ahujasid/blender-mcp`
- PyPI package: `blender-mcp` v1.5.5
- YouTube demo (referenced in task): `https://www.youtube.com/watch?v=0kMhtqYBe4Y`
- Concrete Creations product schema: `apps/concrete/data/products.json`
- Parent asset pipeline task: `12u-cc-handmade-asset-pipeline`
- Downstream content pipeline task: `12u-cc-ai-content-repurpose-pipeline`

---

*End of evaluation. Awaiting Adrian decision before implementation.*
