import { products } from '../lib/products';
import ProductCard from '../components/ProductCard';

export default function HomePage() {
  return (
    <>
      <section className="container-page pt-24 pb-20 md:pt-32 md:pb-28">
        <h1 className="text-display max-w-editorial">
          Concrete figures, cast slowly,<br />
          finished by hand.
        </h1>
        <p className="mt-8 max-w-prose text-body text-secondary">
          Hirobius Studio is a small concrete-casting practice in Spokane,
          Washington. Each piece is made in a limited edition — a few dozen
          casts, then the mold is retired.
        </p>
      </section>

      <div className="rule" />

      <section className="container-page py-20 md:py-28">
        <div className="flex items-baseline justify-between mb-12">
          <h2 className="text-h2">Available</h2>
          <span className="text-eyebrow text-secondary">{products.length} editions</span>
        </div>
        <div className="grid gap-x-8 gap-y-16 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      </section>
    </>
  );
}
