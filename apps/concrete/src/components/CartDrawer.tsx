import { useState } from 'react';
import { useCart } from '../lib/cart';
import { getProduct } from '../lib/products';
import { startCheckout } from '../lib/stripe';

export default function CartDrawer() {
  const { items, isOpen, close, remove, setQuantity } = useCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = items
    .map((it) => {
      const product = getProduct(it.slug);
      return product ? { product, quantity: it.quantity } : null;
    })
    .filter((x): x is { product: NonNullable<ReturnType<typeof getProduct>>; quantity: number } => !!x);

  const subtotal = lines.reduce((acc, l) => acc + l.product.priceUsd * l.quantity, 0);

  async function onCheckout() {
    if (items.length === 0) return;
    setPending(true);
    setError(null);
    try {
      await startCheckout(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setPending(false);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-inverse/30 transition-opacity z-40 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={close}
        aria-hidden="true"
      />
      <aside
        className={`fixed top-0 right-0 h-screen w-full max-w-md bg-page z-50 shadow-2xl transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Shopping cart"
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-borderSubtle px-6 h-16 shrink-0">
          <h2 className="text-lg">Cart</h2>
          <button onClick={close} className="text-sm uppercase tracking-wide hover:opacity-60">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {lines.length === 0 ? (
            <p className="text-secondary text-sm">Your cart is empty.</p>
          ) : (
            <ul className="space-y-6">
              {lines.map(({ product, quantity }) => (
                <li key={product.slug} className="flex gap-4">
                  <div className="w-20 h-24 bg-overlay shrink-0">
                    <img
                      src={product.primaryImage}
                      alt={product.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display">{product.title}</p>
                    <p className="text-xs text-secondary mt-1">{product.subtitle}</p>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <button
                        onClick={() => setQuantity(product.slug, quantity - 1)}
                        className="w-7 h-7 border border-borderDefault hover:border-borderStrong"
                        aria-label={`Decrease ${product.title}`}
                      >
                        −
                      </button>
                      <span className="tabular-nums w-6 text-center">{quantity}</span>
                      <button
                        onClick={() => setQuantity(product.slug, quantity + 1)}
                        className="w-7 h-7 border border-borderDefault hover:border-borderStrong"
                        aria-label={`Increase ${product.title}`}
                      >
                        +
                      </button>
                      <button
                        onClick={() => remove(product.slug)}
                        className="ml-auto text-xs uppercase tracking-wide text-secondary hover:text-error"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="font-display tabular-nums">${product.priceUsd * quantity}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="border-t border-borderSubtle px-6 py-6 space-y-4 shrink-0">
            <div className="flex items-baseline justify-between text-sm">
              <span className="uppercase tracking-wide">Subtotal</span>
              <span className="font-display text-base tabular-nums">${subtotal}</span>
            </div>
            <p className="text-xs text-secondary">
              Free US shipping &amp; Spokane local pickup. Tax calculated at checkout.
            </p>
            {error && <p className="text-xs text-error">{error}</p>}
            <button onClick={onCheckout} disabled={pending} className="btn-primary w-full">
              {pending ? 'Redirecting…' : 'Checkout'}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
