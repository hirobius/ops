import { Link } from 'react-router-dom';
import type { Product } from '../lib/products';
import { isAvailable } from '../lib/products';
import EditionBadge from './EditionBadge';

export default function ProductCard({ product }: { product: Product }) {
  const available = isAvailable(product);
  return (
    <Link
      to={`/products/${product.slug}`}
      className="group block"
    >
      <div className="aspect-[4/5] bg-overlay overflow-hidden rounded-container">
        <img
          src={product.primaryImage}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-h3">{product.title}</h3>
          <p className="text-ui text-secondary mt-1">{product.subtitle}</p>
        </div>
        <p className="font-display text-h3 tabular-nums">${product.priceUsd}</p>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <EditionBadge product={product} />
        {!available && (
          <span className="text-eyebrow text-error">Sold out</span>
        )}
      </div>
    </Link>
  );
}
