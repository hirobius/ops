import type { Product } from '../lib/products';
import { isAvailable } from '../lib/products';
import { useCart } from '../lib/cart';

export default function BuyButton({ product }: { product: Product }) {
  const { add } = useCart();
  const available = isAvailable(product);

  if (!available) {
    return (
      <button disabled className="btn-primary w-full md:w-auto">
        Edition Complete
      </button>
    );
  }

  return (
    <button
      onClick={() => add(product.slug)}
      className="btn-primary w-full md:w-auto"
    >
      Add to Cart — ${product.priceUsd}
    </button>
  );
}
