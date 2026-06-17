# Hirobius Studio — Go-Live Runbook

The day-of-launch sequence. Assumes you've worked through
[`PRE-LAUNCH-CHECKLIST.md`](./PRE-LAUNCH-CHECKLIST.md) and everything
in there is checked. This doc is for the actual flip-the-switch day.

---

## T-7 days

- [ ] Final inventory count physically reconciled to the catalog data
- [ ] Final product photography done + uploaded
- [ ] Pricing locked (raising prices last-minute looks bad)
- [ ] Friends-and-family soft preview: send 3-5 people the staging URL,
      ask for honest feedback on copy, photos, and the checkout flow
- [ ] Address any feedback that's critical (broken flow, factual error,
      typo); ignore aesthetic preferences that don't agree with the
      design vision

## T-3 days

- [ ] Full end-to-end dry run in test mode with the live data (real
      products, real photos, but Stripe test keys)
- [ ] Invite 2-3 friends to complete a test purchase using test cards;
      verify their emails arrived
- [ ] Re-verify Stripe webhook signing secret matches between Stripe
      dashboard and Vercel env vars
- [ ] Test mobile flow one more time (iOS Safari + Android Chrome)

## T-1 day

- [ ] Final read of the 3 legal pages (`/legal/terms`, `/legal/privacy`,
      `/legal/shipping-returns`) — no surviving `// TODO`s
- [ ] WA sales tax verified at checkout one more time
- [ ] Domain renewal status checked (don't get caught with an expired
      cert in the middle of launch)
- [ ] Block out the launch morning + afternoon on your calendar — no
      meetings, no other launches stacked

## Launch morning (day-of)

**Sequence — do these in order, not in parallel:**

1. **08:00 — Sanity check the staging build**
   - [ ] Pull `main`, `pnpm install`, `pnpm build:prerender` locally
   - [ ] Walk through `/`, `/products/<slug>`, `/legal/*` once
   - [ ] No console errors, no missing images

2. **08:30 — Flip Stripe to live keys**
   - [ ] In Vercel project env vars, swap `STRIPE_SECRET_KEY` and
         `STRIPE_PUBLISHABLE_KEY` from `sk_test_*` / `pk_test_*` to
         `sk_live_*` / `pk_live_*`
   - [ ] Update `STRIPE_WEBHOOK_SECRET` to the live webhook secret
         (different from the test one!)
   - [ ] Verify the live webhook endpoint in Stripe dashboard is
         pointing at the production URL

3. **09:00 — Deploy production**
   - [ ] Push `main` (or merge release branch) — Vercel auto-deploys
   - [ ] Watch the build logs until "Deployment ready"
   - [ ] Open the deployed URL, click around for 60 seconds

4. **09:15 — Smoke test with a real card**
   - [ ] Buy the cheapest product with your actual card (real money)
   - [ ] Verify: payment landed in **Stripe live mode**, order
         confirmation email arrived in your inbox, webhook fired (check
         Stripe dashboard → Developers → Webhooks → recent events)
   - [ ] Refund yourself immediately to make sure refund flow works
   - [ ] If anything failed → STOP, fix, do not proceed to announcement

5. **09:30 — Final pre-announce check**
   - [ ] Inventory levels correct (your real-card test purchase shouldn't
         have decremented anything irreversibly)
   - [ ] No half-broken state visible to a fresh visitor (incognito
         window for an objective look)

6. **10:00 — Announce**
   - [ ] Post to your social channels (whatever stack is real for you)
   - [ ] Send to your email list (if you have one)
   - [ ] Share with the friends-and-family who previewed — they'll
         amplify
   - [ ] Update LinkedIn / portfolio if relevant

## First hour after announce — monitor

- [ ] Refresh Stripe dashboard every 15 min for the first hour
- [ ] Have the Vercel logs tab open in another window — watch for any
      500s or repeated 4xx
- [ ] Keep email open — be ready to reply within 15 min to any customer
      inquiry
- [ ] Watch the order email for at least 2 real orders arrive cleanly
      (then trust the pipeline)

## If something breaks during launch

**Checkout broken / payment failing:**

1. Immediately replace the "Buy" button text or hide it with a banner:
   "Brief pause on orders — back in a minute" (this can be a
   one-line CSS toggle if you wire it; otherwise push a quick deploy)
2. Diagnose: check Stripe dashboard → Developers → Events for failed
   payments; check Vercel logs for server errors
3. Fix, deploy, test again with your own card, re-open

**Email not sending:**

1. Check Stripe's email setting (Settings → Customer emails)
2. Test that one of your team's emails arrives — if not, escalate to
   Stripe support (rare but happens)
3. Manually email any customer whose order confirmation didn't arrive

**Shipping label problem post-order:**

1. Email the customer same-day with an explanation + revised ETA
2. Don't promise something you can't deliver; honesty is the recovery
3. If you can't fulfill, refund proactively rather than wait for
   complaint

**Site totally down:**

1. Check Vercel dashboard — sometimes it's their infra, not yours
2. If yours: roll back to the previous deployment from the Vercel UI
   (one click) and investigate later

## Days 1-7 post-launch

- [ ] Respond to every customer inquiry within 24h (set a Google
      Calendar reminder if you have to)
- [ ] Ship every order within 7 days
- [ ] Track in a simple spreadsheet: order #, ship date, customer
      feedback if any
- [ ] End-of-week-1 post-mortem (private notes for yourself):
  - What worked?
  - What broke or almost broke?
  - What's the most common customer question?
  - What do you wish you'd done differently?

## Day-30 retro

- [ ] Pull Stripe sales data + costs (shipping, materials, time)
- [ ] Compute actual margin per piece
- [ ] Decide: which Forms to restock, which to retire, what to make next
- [ ] If you got more orders than capacity → raise prices on next drop
- [ ] If you got fewer → review listing copy, photos, and price; iterate

---

**One bias to fight:** the temptation to keep tweaking pre-launch. At
some point the page is good enough. Ship when the checklist is green;
iterate after real money has changed hands.
