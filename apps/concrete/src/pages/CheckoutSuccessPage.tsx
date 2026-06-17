import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../lib/cart';

export default function CheckoutSuccessPage() {
  const { clear } = useCart();

  useEffect(() => {
    clear();
  }, [clear]);

  return (
    <article className="container-page py-32 max-w-editorial text-center">
      <p className="text-xs uppercase tracking-wide text-secondary">Order received</p>
      <h1 className="mt-4 text-4xl md:text-5xl leading-[1.1]">
        Thank you.
      </h1>
      <p className="mt-8 text-primary leading-relaxed">
        A confirmation email is on its way. Each piece is wrapped and shipped
        from Spokane within 3–5 business days. If you chose local pickup,
        we'll be in touch with details.
      </p>
      <div className="mt-12">
        <Link to="/" className="btn-ghost">Back to studio</Link>
      </div>
    </article>
  );
}
