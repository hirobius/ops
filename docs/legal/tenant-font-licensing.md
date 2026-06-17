# Per-Tenant Font Licensing Strategy

**Document Version:** 2026-05-02  
**Status:** Active licensing policy for HDS multi-tenant platform

## Overview

The Hirobius Design System (HDS) serves multiple font families across the multi-tenant platform. Each font has distinct licensing terms that propagate to all tenant deployments. This document outlines per-font licensing obligations, attribution requirements, and safe-defaults for clients who have not yet specified font preferences.

---

## Font Inventory & Licenses

### 1. Clash Grotesk (Primary / Body)

**Location:** `/public/fonts/clash-grotesk/`  
**Weights:** 300, 400, 500, 600  
**License Type:** Fontshare License (Indian Type Foundry)  
**License URL:** https://www.fontshare.com/fonts/clash-grotesk  

#### Obligations
- **Self-Hosting Permitted:** Yes. Fontshare explicitly permits self-hosting of licensed fonts.
- **Attribution Required:** Yes. Include attribution to Indian Type Foundry in a legible location (e.g., footer, about page, legal notices).
- **Distribution Per Tenant:** Each tenant's standalone deployment includes its own copy of Clash Grotesk in `/public/fonts/clash-grotesk/`.
- **Separate License Per Tenant:** Not required; Hirobius' Fontshare license covers all tenant deployments under the same organizational umbrella.
- **Commercial Use:** Permitted under Fontshare License.
- **Modification:** Not permitted. Serve fonts as-is from Fontshare.

#### Attribution Text
```
Clash Grotesk is licensed under the Fontshare License.
© Indian Type Foundry. All rights reserved.
Font sourced from Fontshare (https://www.fontshare.com/fonts/clash-grotesk).
```

---

### 2. Clash Display (Display Headings)

**Location:** `/public/fonts/clash-display/`  
**Weights:** 300, 400, 500  
**License Type:** Fontshare License (Indian Type Foundry)  
**License URL:** https://www.fontshare.com/fonts/clash-display  

#### Obligations
- **Self-Hosting Permitted:** Yes. Same as Clash Grotesk.
- **Attribution Required:** Yes. Attribution to Indian Type Foundry (may be shared with Clash Grotesk attribution).
- **Distribution Per Tenant:** Each tenant's deployment includes its own copy of Clash Display in `/public/fonts/clash-display/`.
- **Separate License Per Tenant:** Not required.
- **Commercial Use:** Permitted under Fontshare License.
- **Usage Constraint (HDS Internal Policy):** Adrian directive 2026-05-01 restricts Clash Display to display composites, `<h1>`, `<h2>`, `<h3>` only. Never extend to caption, small, or body text.

#### Attribution Text
```
Clash Display is licensed under the Fontshare License.
© Indian Type Foundry. All rights reserved.
Font sourced from Fontshare (https://www.fontshare.com/fonts/clash-display).
```

---

### 3. Geist Mono (Code & Monospace)

**Location:** `/public/fonts/geist-mono/`  
**Weights:** 400, 500  
**License Type:** SIL Open Font License 1.1 (OFL-1.1)  
**License URL:** https://github.com/vercel/geist-font  
**Source:** Vercel (https://github.com/vercel/geist-font)  

#### Obligations
- **Self-Hosting Permitted:** Yes. OFL-1.1 explicitly permits self-hosting and redistribution.
- **Attribution Required:** Yes. Include OFL-1.1 license text and credit Vercel as the source.
- **Distribution Per Tenant:** Each tenant's deployment includes its own copy of Geist Mono in `/public/fonts/geist-mono/`.
- **Separate License Per Tenant:** Not required. OFL-1.1 is permissive and does not require per-deployment licensing.
- **Commercial Use:** Permitted under OFL-1.1.
- **Modification:** Permitted under OFL-1.1 (with re-naming requirements if modified).

#### Attribution Text
```
Geist Mono is licensed under the SIL Open Font License 1.1.
© Vercel. Source: https://github.com/vercel/geist-font.
Licensed under OFL-1.1 (https://openfontlicense.org/).
```

---

### 4. Atkinson Hyperlegible (Fallback / Accessibility)

**Location:** `/public/fonts/atkinson-hyperlegible-*.woff2`  
**Variants:** 
- `atkinson-hyperlegible-next-latin-wght-normal.woff2` (variable)
- `atkinson-hyperlegible-next-latin-ext-wght-normal.woff2` (extended Latin)
- `atkinson-hyperlegible-next-latin-wght-italic.woff2` (italic)
- `atkinson-hyperlegible-mono-regular.woff2` (monospace variant)

**License Type:** SIL Open Font License 1.1 (OFL-1.1)  
**License URL:** https://brailleinstitute.org/freefont  
**Source:** Braille Institute (https://brailleinstitute.org/freefont)  

#### Obligations
- **Self-Hosting Permitted:** Yes. OFL-1.1 explicitly permits self-hosting.
- **Attribution Required:** Yes. Include OFL-1.1 license text and credit the Braille Institute.
- **Distribution Per Tenant:** Each tenant's deployment includes Atkinson Hyperlegible as a fallback in `/public/fonts/`.
- **Separate License Per Tenant:** Not required.
- **Commercial Use:** Permitted under OFL-1.1.
- **Modification:** Permitted under OFL-1.1 (with re-naming requirements if modified).
- **Accessibility Note:** Atkinson Hyperlegible is explicitly designed for dyslexia-friendly readability and serves as a critical accessibility fallback for clients and users with visual processing differences.

#### Attribution Text
```
Atkinson Hyperlegible is licensed under the SIL Open Font License 1.1.
© Braille Institute. Source: https://brailleinstitute.org/freefont.
Licensed under OFL-1.1 (https://openfontlicense.org/).
Designed for accessibility and dyslexia-friendly readability.
```

---

### 5. Noto Sans Arabic (Multilingual Support)

**Location:** `/public/fonts/noto-sans-arabic-*.ttf`  
**Weights:** 400, 500, 700  
**License Type:** SIL Open Font License 1.1 (OFL-1.1)  
**License URL:** https://fonts.google.com/specimen/Noto+Sans+Arabic  
**Source:** Google Fonts  

#### Obligations
- **Self-Hosting Permitted:** Yes. OFL-1.1 explicitly permits self-hosting.
- **Attribution Required:** Yes. Include OFL-1.1 license text and credit Google Fonts / Unicode Consortium.
- **Distribution Per Tenant:** Each tenant's deployment includes Noto Sans Arabic in `/public/fonts/`.
- **Separate License Per Tenant:** Not required.
- **Commercial Use:** Permitted under OFL-1.1.
- **Modification:** Permitted under OFL-1.1.

#### Attribution Text
```
Noto Sans Arabic is licensed under the SIL Open Font License 1.1.
© Google / Unicode Consortium. Source: https://fonts.google.com/specimen/Noto+Sans+Arabic.
Licensed under OFL-1.1 (https://openfontlicense.org/).
```

---

## Safe-Defaults for New Tenant Deployments

**Adrian Directive 2026-05-02:** When onboarding a new tenant without explicit font preferences, use **SIL-OFL-only fonts** to minimize per-tenant legal review friction.

### Default Font Stack
```css
/* Primary & Body Text */
--primitive-typography-family-primary: 'Atkinson Hyperlegible Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Display Headings */
--primitive-typography-family-display: 'Atkinson Hyperlegible Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

/* Monospace / Code */
--primitive-typography-family-mono: 'Atkinson Hyperlegible Mono', monospace;
```

**Rationale:**
- Atkinson Hyperlegible is OFL-1.1 licensed → no per-tenant legal review required.
- Atkinson Hyperlegible is explicitly designed for accessibility and dyslexia-friendly readability.
- No Fontshare-licensed fonts (Clash Display / Clash Grotesk) in the default → faster tenant onboarding.
- Clients may opt-in to Clash fonts after legal review by Hirobius.

### Tenant Opt-In Process for Fontshare Fonts

If a client requests Clash Display or Clash Grotesk:

1. **Client Acknowledgment:** Client confirms in writing that they understand Fontshare licensing terms.
2. **Hirobius Legal Review:** Adrian (or designated legal contact) reviews the client's use case.
3. **Attribution Placement:** Client agrees to display Fontshare attribution in their legal/footer notice.
4. **Deployment:** Enable Clash fonts in the tenant's CSS override file. Update tenant record with `fontshareOptIn: true` and date.
5. **Documentation:** Record opt-in decision in the tenant's profile for audit purposes.

---

## Per-Tenant Deployment Model

### Directory Structure
Each tenant deployment receives its own isolated font stack:

```
tenant-{client-id}/
  public/
    fonts/
      clash-grotesk/     (if fontshareOptIn: true)
      clash-display/     (if fontshareOptIn: true)
      geist-mono/
      atkinson-hyperlegible-*.woff2
      noto-sans-arabic-*.ttf
```

### License Propagation Rules

| Font | License | Per-Tenant Review Required | Included by Default |
|------|---------|----------------------------|---------------------|
| Clash Grotesk | Fontshare | Yes (opt-in) | No |
| Clash Display | Fontshare | Yes (opt-in) | No |
| Geist Mono | OFL-1.1 | No | Yes |
| Atkinson Hyperlegible | OFL-1.1 | No | Yes |
| Noto Sans Arabic | OFL-1.1 | No | Yes |

---

## Attribution & Legal Notices

### Recommended Footer Placement
All deployed tenants must include the following in their footer or legal notices page:

```markdown
### Font Licenses & Attribution

This site uses the following open-source and licensed fonts:

- **Geist Mono** — Licensed under SIL OFL 1.1 © Vercel (https://github.com/vercel/geist-font)
- **Atkinson Hyperlegible** — Licensed under SIL OFL 1.1 © Braille Institute (https://brailleinstitute.org/freefont)
- **Noto Sans Arabic** — Licensed under SIL OFL 1.1 © Google Fonts / Unicode Consortium

[If Fontshare fonts are enabled:]
- **Clash Grotesk** — Licensed under Fontshare License © Indian Type Foundry
- **Clash Display** — Licensed under Fontshare License © Indian Type Foundry

View full license text: [Link to /legal/licenses]
```

### License Text Files
Place full OFL-1.1 text in `public/legal/OFL-1.1.txt` for reference.  
Place Fontshare license summary in `public/legal/FONTSHARE-LICENSE.md` (for opt-in tenants).

---

## Tenant Onboarding Checklist

### For SIL-OFL-Only Deployments (Default)
- [ ] Include Atkinson Hyperlegible, Geist Mono, Noto Sans Arabic in `/public/fonts/`
- [ ] Add OFL attribution to footer/legal page
- [ ] Include `/public/legal/OFL-1.1.txt`
- [ ] No Hirobius legal review required

### For Fontshare-Enabled Deployments (Opt-In)
- [ ] Client confirms Fontshare opt-in in writing
- [ ] Hirobius legal reviews client use case
- [ ] Include Clash Grotesk and/or Clash Display in `/public/fonts/`
- [ ] Add Fontshare attribution to footer/legal page
- [ ] Record opt-in date in tenant profile
- [ ] Document decision in audit log
- [ ] Include `/public/legal/FONTSHARE-LICENSE.md`

---

## Known Issues & Future Considerations

### General Sans (Deprecated)
Files exist in `/public/fonts/general-sans-*.woff2` but are not currently in use. These should be removed in a future cleanup pass to reduce deployment size.

### Fontshare Renewal
Hirobius' Fontshare license subscription must be maintained to guarantee legal standing for all tenant deployments. Review renewal status annually (Adrian responsible for tracking).

### Multilingual Expansion
If additional language support is required (e.g., CJK, Devanagari), evaluate Google Fonts alternatives that are OFL-1.1 licensed to maintain the "default = minimal legal review" principle.

---

## References

- **Fontshare License:** https://www.fontshare.com/license
- **SIL Open Font License 1.1:** https://openfontlicense.org/
- **Vercel Geist Font:** https://github.com/vercel/geist-font
- **Braille Institute Atkinson Hyperlegible:** https://brailleinstitute.org/freefont
- **Google Fonts (Noto Sans Arabic):** https://fonts.google.com/specimen/Noto+Sans+Arabic

---

**Last Updated:** 2026-05-02  
**Authored By:** Haiku Agent  
**Reviewed By:** [Adrian — legal sign-off pending]
