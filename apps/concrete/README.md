# Hirobius Studio

Storefront for Hirobius LLC's concrete figurine product line. Handmade,
cast in small editions, made in Spokane, Washington.

- **Domain (planned):** `hirobius.studio`
- **Stack:** Vite + React Router + Tailwind + Stripe Checkout
- **Hosting:** Vercel (static + serverless functions)
- **Catalog:** `data/products.json` (content) + Stripe Products (price + payment)

## Local dev

```bash
pnpm install
cp .env.example .env.local
# fill in STRIPE_*, DISCORD_SALES_WEBHOOK_URL
pnpm dev
```

For Stripe webhook testing locally:

```bash
stripe listen --forward-to localhost:5180/api/stripe-webhook
# copy the signing secret it prints into STRIPE_WEBHOOK_SECRET
```

## Adding a Form

1. Add an entry to `data/products.json` (see existing entries for shape).
2. Drop product photos in `public/products/<slug>/`.
3. Create the Stripe product + price in the Stripe Dashboard.
4. Paste the resulting `price_xxx` into the entry's `stripePriceId`.
5. Commit. Vercel rebuilds. Live.

## Sale flow

1. Visitor adds Forms to cart drawer (state in localStorage).
2. Checkout button POSTs cart to `/api/create-checkout-session`.
3. Stripe Checkout (hosted) handles payment + shipping address.
4. Stripe webhook → `/api/stripe-webhook` decrements `edition.remaining` in
   `products.json` (committed via the build, so it's eventually consistent).
5. Discord webhook posts to `#sales`.
6. Stripe sends payment receipt email to buyer + Adrian.

## Hand-off / first-launch

See `SETUP.md` for the at-the-computer checklist (domain registration,
Stripe account, Discord webhook, Vercel project + DNS, photography).
