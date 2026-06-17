import { Link } from 'react-router-dom';
import { useCart } from '../lib/cart';

export default function Header() {
  const { count, toggle } = useCart();

  return (
    <header className="border-b border-borderSubtle bg-page/95 backdrop-blur sticky top-0 z-30">
      <div className="container-page flex items-center justify-between h-16">
        <Link
          to="/"
          className="font-display text-h3 hover:opacity-70 transition-opacity"
        >
          Hirobius Studio
        </Link>
        <nav className="flex items-center gap-8 text-eyebrow">
          <Link to="/about" className="hover:opacity-60 transition-opacity">About</Link>
          <Link to="/contact" className="hover:opacity-60 transition-opacity">Contact</Link>
          <button
            onClick={toggle}
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
            className="relative hover:opacity-60 transition-opacity"
          >
            Cart{count > 0 && <span className="ml-1 tabular-nums">({count})</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}
