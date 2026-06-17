# Hirobius Studio — at-the-computer setup

Everything that requires a browser, terminal, or external dashboard
lives here. The codebase is fully scaffolded; this is the
"plug-in-the-keys" checklist for first launch.

## 1. Install + first run (5 min)

From the worktree root (`/home/adrian/projects/concrete-creations`):

```bash
cd apps/concrete
pnpm install
cp .env.example .env.local
pnpm dev
# → http://localhost:5180
```

The site should render with placeholder products and broken images
(no photos yet). That's expected.

## 2. Domain — `hirobius.studio` (10 min)

- Register `hirobius.studio` at any registrar (Porkbun, Namecheap, Cloudflare).
  ~$30/yr for the .studio TLD.
- Don't configure DNS until step 4 (Vercel will tell you what records to add).

## 3. Stripe account + products (30–45 min)

1. Create / log into Stripe at <https://dashboard.stripe.com>. The legal
   entity is **Hirobius LLC** — make sure the account is registered to
   the LLC (EIN, WA address).
2. Toggle **Test mode** for the entire setup below. Switch to live only
   after you've placed a test order successfully.
3. Create one Stripe Product per Form:
   - Name: `Form 01` / `Form 02` / `Form 03`
   - Price: matches `priceUsd` in `data/products.json`
   - One-time payment, USD
4. Copy the resulting `price_xxx` ID into the matching entry's
   `stripePriceId` field in `data/products.json`. Replace the
   `price_TODO_form_NN` placeholders.
5. Get keys from <https://dashboard.stripe.com/apikeys>:
   - `STRIPE_SECRET_KEY` → `.env.local`
   - `VITE_STRIPE_PUBLISHABLE_KEY` → `.env.local`
6. **Webhook**: at <https://dashboard.stripe.com/webhooks>, add an
   endpoint pointing at `https://hirobius.studio/api/stripe-webhook`
   listening for `checkout.session.completed`. Copy the signing
   secret into `STRIPE_WEBHOOK_SECRET`.

## 4. Vercel project + DNS (15 min)

1. Push the branch to GitHub. (Currently `feat/concrete-creations` in
   the parent repo. Either merge to main and let Vercel watch the
   monorepo, or extract `apps/concrete/` to its own repo and connect
   that — see the "Extraction" appendix at the bottom.)
2. At <https://vercel.com/new>, import the repo. **Set the root
   directory to `apps/concrete`** so Vercel only deploys this app.
3. Add the four env vars from `.env.local` into the Vercel project's
   Environment Variables panel. Mark `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` as Production-only initially.
4. Add `hirobius.studio` and `www.hirobius.studio` as custom domains.
   Vercel prints the exact A / CNAME records — paste those into your
   registrar's DNS panel.
5. Wait for cert provisioning (~5 min). Visit `https://hirobius.studio`.

## 5. Discord webhook (5 min)

1. In your Discord server, create a `#sales` channel (or pick one).
2. Channel settings → Integrations → Webhooks → New Webhook → name it
   "Hirobius Studio sales" → copy the webhook URL.
3. Paste into `DISCORD_SALES_WEBHOOK_URL` in `.env.local` *and* in the
   Vercel env vars panel.

## 6. Photography (the real blocker)

Three photos per Form is the launch minimum. Goal:

- One **straight-on hero** on a neutral background (bone / off-white).
- One **angled** shot showing depth + form.
- One **detail / texture** crop.

Save as JPG, 2000px on the long edge, sRGB. Place at:

```
public/products/form-01/01.jpg
public/products/form-01/02.jpg
public/products/form-01/03.jpg
```

(Same pattern for `form-02`, `form-03`.) The schema already references
these paths.

## 7. Test order checklist

Before flipping to live mode:

- [ ] `pnpm dev` runs, all three Form cards appear on home.
- [ ] Click Form 01 → product page renders with story + dimensions.
- [ ] Add Form 01 + Form 02 to cart → drawer shows both.
- [ ] Adjust quantity, remove an item — works.
- [ ] Click Checkout → Stripe Checkout page loads (test card: `4242 4242 4242 4242`).
- [ ] Pick "Local Pickup — Spokane, WA" — appears in shipping options.
- [ ] Complete checkout → land on `/checkout/success`.
- [ ] Stripe dashboard shows the test payment.
- [ ] Discord `#sales` channel receives a 🪨 New sale message.
- [ ] (Manually) Decrement `edition.remaining` for that Form in `products.json` and commit.

## 8. Going live

1. In Stripe, switch from Test mode to Live mode. Repeat product/price
   creation in live mode (Stripe doesn't auto-migrate test products).
2. Update `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`,
   `STRIPE_WEBHOOK_SECRET` in Vercel to live values.
3. Update `stripePriceId` values in `data/products.json` to the live
   price IDs. Commit.
4. Place one real $1 test order on your own card to verify end-to-end.
   Refund it from the Stripe dashboard.

## Hard rules — recap

- Never push secrets. `.env.local` is gitignored. Vercel env vars are
  the only persistent secret store.
- Never hand over the Stripe webhook secret to a sub-agent or paste it
  into chat.
- WA sales tax: not collected at checkout in this scaffold. Below
  multi-state economic-nexus thresholds you only owe WA. Track total
  sales by state quarterly; revisit Stripe Tax ($120/yr) when you
  approach $100K in any single state.

---

## Appendix — Extraction to a separate repo (optional, later)

When `apps/concrete/` is mature and you want it in its own GitHub repo:

```bash
# from the parent repo
git filter-repo --subdirectory-filter apps/concrete --path-rename apps/concrete/:./
# push the resulting tree to a fresh empty repo on GitHub
```

The Vercel project just re-points at the new repo. Domain stays attached.
The codebase has no relative imports outside `apps/concrete/`, so
nothing else needs to move.
