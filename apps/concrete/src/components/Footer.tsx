import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-borderSubtle mt-24">
      <div className="container-page py-12 grid gap-8 md:grid-cols-3 text-ui text-secondary">
        <div>
          <p className="font-display text-h3 text-primary">Hirobius Studio</p>
          <p className="mt-2">Handmade concrete figures.<br />Made in Spokane, Washington.</p>
        </div>
        <div className="space-y-2">
          <p className="text-eyebrow text-primary">Visit</p>
          <Link to="/about" className="block hover:text-primary transition-colors">About</Link>
          <Link to="/contact" className="block hover:text-primary transition-colors">Contact</Link>
        </div>
        <div className="space-y-2">
          <p className="text-eyebrow text-primary">Policies</p>
          <Link to="/legal/shipping-returns" className="block hover:text-primary transition-colors">Shipping &amp; Returns</Link>
          <Link to="/legal/terms" className="block hover:text-primary transition-colors">Terms</Link>
          <Link to="/legal/privacy" className="block hover:text-primary transition-colors">Privacy</Link>
        </div>
      </div>
      <div className="container-page pb-10 text-mono text-disabled">
        © {new Date().getFullYear()} Hirobius LLC.
      </div>
    </footer>
  );
}
