import data from '../../data/products.json';

export type Product = {
  slug: string;
  title: string;
  subtitle: string;
  story: string;
  dimensions: string;
  weightLbs: number;
  materials: string[];
  priceUsd: number;
  stripePriceId: string;
  edition: { total: number; remaining: number };
  status: 'available' | 'sold-out' | 'archived';
  images: string[];
  primaryImage: string;
};

export const products: Product[] = data.products as Product[];

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function isAvailable(p: Product): boolean {
  return p.status === 'available' && p.edition.remaining > 0;
}

export function editionLabel(p: Product): string {
  const { total, remaining } = p.edition;
  if (remaining === 0) return 'Edition complete';
  if (total <= 30) return `${remaining} of ${total} remaining`;
  return `Edition of ${total}`;
}
