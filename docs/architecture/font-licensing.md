# Font Licensing — Multi-Tenant Deployment

**Unit:** 12m-mt-typography-licensing  
**Decided:** 2026-05-03

All three HDS fonts are cleared for tenant subdomain deployment with no renegotiation required.

## Clash Display — ITF Free Font License (Fontshare)

- **Subdomains:** Permitted. ITF FFL allows "any media, any scale, any location worldwide."
- **Attribution:** Required — credit ITF by name in design/production credits.
- **Commercial/SaaS:** No restrictions. Explicitly free for commercial use at any scale.
- **Redistribution:** Cannot re-sell or redistribute font files as standalone products (standard; doesn't affect HDS use).
- **Project status:** Self-hosted at `public/fonts/clash-display/`, declared in `src/styles/fonts.css`.

## Geist Mono — SIL Open Font License 1.1 (Vercel)

- **Subdomains:** Unrestricted. OFL 1.1 has no domain restrictions.
- **Attribution:** Include `LICENSE.txt` alongside font files or link to it (e.g., from `/license` page).
- **Commercial/SaaS:** Fully compatible with multi-tenant, white-label, and SaaS bundling.
- **Project status:** Self-hosted at `public/fonts/geist-mono/`, OFL-1.1 noted in `fonts.css` comments.

## Clash Grotesk — ITF Free Font License (Indian Type Foundry)

- **Subdomains:** Unrestricted. Same FFL terms as Clash Display.
- **Attribution:** Include ITF/Fontshare attribution (covered by `/license` route in `LicensePage.tsx`).
- **Commercial/SaaS:** No restrictions. Fully compatible with multi-tenant deployments.
- **Project status:** Self-hosted at `public/fonts/clash-grotesk/`, declared via `@font-face` in `src/styles/fonts.css`. Body and UI typeface across the system.

## Atkinson Hyperlegible — SIL Open Font License 1.1 (Braille Institute) — woff2 retained, not currently @font-face declared

- **Subdomains:** Unrestricted. Same OFL 1.1 terms as Geist Mono.
- **Attribution:** Include OFL license text only if shipped to runtime. As of 2026-05 the system has migrated to Clash Grotesk + Clash Display + Geist Mono and Atkinson is not loaded.
- **Project status:** woff2 files retained in `public/fonts/atkinson-hyperlegible-*.woff2` for optional accessibility fallback, but no `@font-face` rule references them. To re-enable for a specific tenant or accessibility opt-in, add `@font-face` declarations and a custom CSS variable override.

## Summary for Client Deployments

| Font | License | Tenant Subdomains | Loaded today | Attribution in UI |
|------|---------|-------------------|--------------|-------------------|
| Clash Display | ITF FFL | ✅ Yes | ✅ Yes | Credit ITF in design/production credits |
| Clash Grotesk | ITF FFL | ✅ Yes | ✅ Yes | Credit ITF in design/production credits |
| Geist Mono | SIL OFL 1.1 | ✅ Yes | ✅ Yes | Link to LICENSE.txt (covered by `/license`) |
| Atkinson Hyperlegible | SIL OFL 1.1 | ✅ Yes | ❌ No (woff2 retained, opt-in only) | Link to LICENSE.txt only when re-enabled |

**Action:** Ensure each tenant deployment links to `/license` or equivalent. Clash Display requires ITF attribution visible in production credits (footer or about page is sufficient).
