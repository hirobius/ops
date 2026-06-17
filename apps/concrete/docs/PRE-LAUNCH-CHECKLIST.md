# Hirobius Studio — Pre-Launch Checklist

Work through this before flipping `hirobius.studio` live. Sections in
roughly the order you'd hit them; everything is a checkbox — tick when
verified. Anything that's `// TODO: legal review` or similar in the
codebase should be cleared with counsel before this checklist is fully
green.

> ⚠ **Never commit live Stripe keys.** Keep them in `.env.local`
> (gitignored) and in Vercel's project env vars (production scope) only.
> See `CLAUDE.md` hard rules.

---

## 1. Domain + DNS

- [ ] `hirobius.studio` registered (verify renewal auto-pay is on)
- [ ] DNS pointed at the hosting target (Vercel project for `apps/concrete`)
- [ ] `www.hirobius.studio` redirect → `hirobius.studio` (or vice versa, pick one)
- [ ] SSL cert issued + auto-renewing (Vercel handles automatically)
- [ ] Confirm cert is valid in 3 browsers (Chrome / Safari / Firefox)

## 2. Stripe — payments

- [ ] Stripe account verified for Hirobius LLC (EIN, bank for payouts)
- [ ] Live secret + publishable keys in `.env.local` (and Vercel env vars)
- [ ] Webhook endpoint configured: `https://hirobius.studio/api/stripe-webhook`
  - [ ] Selected events: `checkout.session.completed`, `charge.refunded`,
        `payment_intent.payment_failed`
- [ ] Webhook signing secret in env vars
- [ ] Payout schedule set (manual vs. auto-daily — your call)
- [ ] Tax: Stripe Tax enabled for WA (and any other states you ship to)
- [ ] Shipping rates: Stripe Checkout shipping options configured

## 3. Product catalog

- [ ] At least 3 real products in `apps/concrete/data/products.ts` (or wherever the catalog lives)
- [ ] Each product has: title, slug, subtitle, price, photo(s), edition count, description
- [ ] All photos are real (not placeholder), 1200×1500 minimum, color-corrected
- [ ] Each product has a Stripe Price ID and is linked from the catalog
- [ ] `alt` text on every product image (accessibility + SEO)
- [ ] Edition counters match physical inventory you actually have

## 4. Inventory tracking

- [ ] Decide on tracking source of truth: manual JSON in repo? Airtable? Stripe inventory? (Pick ONE and document)
- [ ] Process for marking sold-out documented in `apps/concrete/docs/INVENTORY.md` (create if not present)
- [ ] Sold-out state renders correctly on `/products/<slug>` and `/` (verify)

## 5. Tax & legal

- [ ] WA sales tax computed correctly at checkout for a few test addresses (Spokane, Seattle, Vancouver WA, out-of-state)
- [ ] Stripe Tax handles destination-based tax for other states (or fallback: flat-rate WA-only with a "we don't ship outside WA yet" disclosure)
- [ ] `/legal/terms`, `/legal/privacy`, `/legal/shipping-returns` all reviewed and linked from the site footer
- [ ] All `// TODO: legal review` comments in the legal pages addressed
- [ ] Business license/registration current with WA Department of Revenue

## 6. Test-mode end-to-end

- [ ] Stripe test mode active in dev (`.env.local` uses `sk_test_*`)
- [ ] Complete a full purchase flow: cart → checkout → 4242 test card → success → email confirmation → refund
- [ ] Test with each shipping option
- [ ] Test with each WA tax address
- [ ] Test cart with multiple items
- [ ] Test browser back-button mid-checkout
- [ ] Test refund flow from Stripe dashboard → confirm webhook fires → confirm UI/email reflects refund

## 7. Real $0.50 launch test

- [ ] Create one $0.50 "test edition" product (or temporarily price an existing one at $0.50)
- [ ] Buy it with your real card
- [ ] Verify: payment landed in Stripe live mode, webhook fired, order confirmation email arrived
- [ ] Refund yourself, verify the refund flow end-to-end
- [ ] Delete or hide the test product before going public

## 8. Email — transactional

- [ ] Order confirmation email template tested (Stripe Checkout's default OR your custom template)
- [ ] Reply-to address is `studio@hirobius.com` (or a monitored inbox)
- [ ] Confirmation includes: order #, items, total, shipping address, ETA, support email
- [ ] Test that the email actually arrives (not in spam) for at least 2 providers (Gmail + Apple Mail / Outlook)

## 9. Analytics — opt-in decision

- [ ] Decide: ship with zero analytics (matches the Privacy page claim) OR add a first-party analytics layer (e.g., Plausible self-hosted)
- [ ] If adding analytics: update `PrivacyPage.tsx` to disclose it
- [ ] If staying analytics-free: leave the no-third-party claim intact in Privacy

## 10. Accessibility quick-pass

- [ ] Keyboard nav through entire purchase flow without using mouse
- [ ] Tab order is sensible
- [ ] All buttons/links have visible focus rings
- [ ] All images have `alt` text (decorative ones marked `alt=""`)
- [ ] Color contrast meets WCAG AA on text + buttons (use a contrast checker on the live palette)
- [ ] Page titles are unique per route (`/products/<slug>` page should show product name in `<title>`)

## 11. Mobile

- [ ] Full purchase flow on iOS Safari (iPhone)
- [ ] Full purchase flow on Android Chrome
- [ ] Cart drawer opens correctly on touch
- [ ] Stripe Checkout renders correctly on mobile (Stripe handles, but verify)
- [ ] No horizontal scroll on any page (320px–414px width)

## 12. SEO

- [ ] `<title>` and `<meta name="description">` per route (per-product titles especially)
- [ ] `og:image` per product (1200×630 — or a single brand fallback if you're OK with that)
- [ ] `og:title`, `og:description`, `og:url`, `og:type` set
- [ ] Twitter Card meta (`twitter:card="summary_large_image"`)
- [ ] `canonical` link per page
- [ ] `robots.txt` allows `/`, disallows `/admin` and `/api` (if those exist)
- [ ] `sitemap.xml` generated and linked from `robots.txt` (`Sitemap: https://hirobius.studio/sitemap.xml`)
- [ ] Submit sitemap to Google Search Console (optional, easy)

## 13. Performance

- [ ] Run Lighthouse mobile on `/` and on `/products/<slug>` — both ≥ 80 on Performance
- [ ] Largest Contentful Paint (LCP) under 2.5s
- [ ] All images use `loading="lazy"` except above-the-fold hero
- [ ] All product images served as `.webp` (or AVIF) — original PNG/JPG fallback if needed
- [ ] Total page weight under 1.5 MB for home + product page

## 14. Error pages + edge cases

- [ ] `/404` route exists and looks intentional, not a stack trace
- [ ] `/checkout/cancel` route reads as "your cart is still here, try again"
- [ ] Stripe failed-payment flow tested (use card `4000 0000 0000 0002`)
- [ ] Empty cart state isn't a crash

## 15. Final pre-flight

- [ ] All `// TODO`s in the codebase reviewed: either resolved or annotated as known
- [ ] Run `pnpm typecheck`, `pnpm build:prerender`, `pnpm test:layout` — all green
- [ ] `.env.local` does NOT contain test keys when you flip to live
- [ ] Backup the catalog data (commit it OR snapshot Airtable, whatever the source of truth is)
- [ ] Tell your support inbox owner you're going live (so they expect customer emails)
- [ ] Pick a launch window (avoid Friday afternoons, holidays, your travel days)

---

When every box above is checked, see [`GO-LIVE-RUNBOOK.md`](./GO-LIVE-RUNBOOK.md) for the day-of sequence.
