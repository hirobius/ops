import type { Product } from '../lib/products';
import { editionLabel } from '../lib/products';

export default function EditionBadge({ product }: { product: Product }) {
  const label = editionLabel(product);
  const soldOut = product.edition.remaining === 0;
  return (
    <span
      className={`inline-flex items-center text-xs uppercase tracking-wide ${
        soldOut ? 'text-disabled' : 'text-secondary'
      }`}
    >
      {label}
    </span>
  );
}
