import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import productData from '../data/products.json' with { type: 'json' };

type Product = {
  slug: string;
  title: string;
  stripePriceId: string;
  status: string;
  edition: { remaining: number };
};

const products = (productData as { products: Product[] }).products;

type IncomingItem = { slug: string; quantity: number };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    res.status(500).json({ error: 'Stripe is not configured.' });
    return;
  }

  const siteUrl = process.env.VITE_SITE_URL ?? `https://${req.headers.host ?? 'hirobius.studio'}`;

  let body: { items?: IncomingItem[] };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' });
    return;
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: 'Cart is empty.' });
    return;
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  for (const it of items) {
    const product = products.find((p) => p.slug === it.slug);
    if (!product) {
      res.status(400).json({ error: `Unknown product: ${it.slug}` });
      return;
    }
    if (product.status !== 'available' || product.edition.remaining < it.quantity) {
      res.status(409).json({ error: `${product.title} is no longer available in that quantity.` });
      return;
    }
    if (!product.stripePriceId || product.stripePriceId.startsWith('price_TODO')) {
      res.status(500).json({ error: `${product.title} is missing a Stripe price ID. Set it in data/products.json.` });
      return;
    }
    lineItems.push({
      price: product.stripePriceId,
      quantity: it.quantity,
      adjustable_quantity: { enabled: true, minimum: 1, maximum: product.edition.remaining },
    });
  }

  const stripe = new Stripe(secret, { apiVersion: '2025-02-24.acacia' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        {
          shipping_rate_data: {
            display_name: 'Free US Shipping',
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'usd' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            },
          },
        },
        {
          shipping_rate_data: {
            display_name: 'Local Pickup — Spokane, WA',
            type: 'fixed_amount',
            fixed_amount: { amount: 0, currency: 'usd' },
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 1 },
              maximum: { unit: 'business_day', value: 3 },
            },
          },
        },
      ],
      // TODO: enable Stripe Tax when ready ($120/yr) — handles automatic
      // sales-tax calc by destination. Until then, sales tax is not
      // collected at checkout (WA only, below multi-state nexus thresholds).
      // automatic_tax: { enabled: true },
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel`,
      metadata: {
        cart_slugs: items.map((i) => `${i.slug}:${i.quantity}`).join(','),
      },
    });

    if (!session.url) {
      res.status(500).json({ error: 'Stripe did not return a checkout URL.' });
      return;
    }

    res.status(200).json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    res.status(500).json({ error: message });
  }
}
