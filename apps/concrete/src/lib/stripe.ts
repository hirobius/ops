import type { CartItem } from './cart';

export type CheckoutPayload = {
  items: CartItem[];
};

export type CheckoutResponse = {
  url: string;
};

export async function startCheckout(items: CartItem[]): Promise<void> {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items } satisfies CheckoutPayload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Checkout failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as CheckoutResponse;
  window.location.href = data.url;
}
