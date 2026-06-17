import { useParams, Link, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { getProduct } from '../lib/products';
import EditionBadge from '../components/EditionBadge';
import BuyButton from '../components/BuyButton';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const product = slug ? getProduct(slug) : undefined;
  const [activeImage, setActiveImage] = useState(0);

  if (!product) return <Navigate to="/" replace />;

  return (
    <article className="container-page py-12 md:py-20">
      <Link to="/" className="text-eyebrow text-secondary hover:text-primary">
        ← All editions
      </Link>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <div className="aspect-[4/5] bg-overlay overflow-hidden rounded-container">
            <img
              src={product.images[activeImage] ?? product.primaryImage}
              alt={product.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setActiveImage(i)}
                  className={`aspect-square bg-overlay overflow-hidden rounded-container border ${
                    i === activeImage ? 'border-borderStrong' : 'border-transparent'
                  }`}
                  aria-label={`View image ${i + 1}`}
                >
                  <img
                    src={src}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:pt-4">
          <h1 className="text-h1">{product.title}</h1>
          <p className="mt-2 text-body text-secondary">{product.subtitle}</p>
          <p className="mt-6 font-display text-h2 tabular-nums">${product.priceUsd}</p>
          <div className="mt-2"><EditionBadge product={product} /></div>

          <p className="mt-8 max-w-prose text-body text-primary">{product.story}</p>

          <dl className="mt-10 grid grid-cols-[8rem_1fr] gap-y-3 text-ui">
            <dt className="text-eyebrow text-secondary">Dimensions</dt>
            <dd>{product.dimensions}</dd>
            <dt className="text-eyebrow text-secondary">Weight</dt>
            <dd>{product.weightLbs} lbs</dd>
            <dt className="text-eyebrow text-secondary">Materials</dt>
            <dd>{product.materials.join(', ')}</dd>
            <dt className="text-eyebrow text-secondary">Edition</dt>
            <dd>{product.edition.total} casts total</dd>
            <dt className="text-eyebrow text-secondary">Shipping</dt>
            <dd>Free US shipping. Spokane pickup available.</dd>
          </dl>

          <div className="mt-10">
            <BuyButton product={product} />
          </div>
        </div>
      </div>
    </article>
  );
}
