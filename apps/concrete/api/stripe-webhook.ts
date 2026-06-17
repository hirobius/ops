import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

async function postToDiscord(content: string): Promise<void> {
  const url = process.env.DISCORD_SALES_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch {
    // Don't fail the webhook on Discord delivery failure.
  }
}

function formatSaleMessage(session: Stripe.Checkout.Session): string {
  const cartSlugs = session.metadata?.cart_slugs ?? '(unknown)';
  const total = session.amount_total != null ? `$${(session.amount_total / 100).toFixed(2)}` : '?';
  const ship = session.shipping_details?.address;
  const where = ship ? `${ship.city ?? ''}, ${ship.state ?? ''} ${ship.country ?? ''}`.trim() : 'address pending';
  const buyer = session.customer_details?.name ?? session.customer_details?.email ?? 'unknown buyer';
  return `🪨 New sale — ${total}\nForms: ${cartSlugs}\nBuyer: ${buyer}\nShip: ${where}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whSecret) {
    res.status(500).json({ error: 'Stripe is not configured.' });
    return;
  }

  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });

  const sig = req.headers['stripe-signature'];
  if (!sig || Array.isArray(sig)) {
    res.status(400).json({ error: 'Missing stripe-signature header.' });
    return;
  }

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature.';
    res.status(400).json({ error: `Webhook signature verification failed: ${message}` });
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    await postToDiscord(formatSaleMessage(session));

    // TODO: decrement edition.remaining in data/products.json.
    // Two viable patterns:
    //   (a) Vercel KV / Upstash Redis for atomic decrement, then nightly
    //       sync back to products.json via a cron action.
    //   (b) GitHub API write to products.json + Vercel auto-redeploy
    //       (slow but version-controlled).
    // For now: Discord notification fires and Adrian updates the JSON
    // manually via PR. Acceptable at 1–3 SKU launch volume.
  }

  res.status(200).json({ received: true });
}
