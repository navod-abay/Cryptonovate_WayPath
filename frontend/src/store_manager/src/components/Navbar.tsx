import { useCallback, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CaretDown } from '@phosphor-icons/react';
import TypeIcon from './TypeIcon';
import { useAppStore } from '@/state/store';
import { useClickOutside } from '@/hooks/useClickOutside';
import './Navbar.css';

interface MenuItem { label: string; to: string }

function NavMenu({ label, items, active }: { label: string; items: MenuItem[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);
  const navigate = useNavigate();

  return (
    <div className="sm-nav__menu" ref={ref}>
      <button
        type="button"
        className={`sm-nav__link${active ? ' is-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <CaretDown size={20} className={`sm-nav__caret${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <div className="sm-nav__dropdown" role="menu">
          {items.map((it) => (
            <button
              key={it.to}
              type="button"
              role="menuitem"
              className="sm-nav__dropdown-item"
              onClick={() => { setOpen(false); navigate(it.to); }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const outlet = useAppStore((s) => s.outlet);
  const { pathname } = useLocation();

  return (
    <header className="sm-nav">
      <div className="sm-nav__inner">
        <Link to="/" className="sm-nav__brand">WayPath</Link>

        <nav className="sm-nav__links" aria-label="Main">
          <NavLink to="/" end className={({ isActive }) => `sm-nav__link${isActive ? ' is-active' : ''}`}>
            Home
          </NavLink>
          <NavMenu
            label="Orders"
            active={pathname.startsWith('/orders')}
            items={[
              { label: 'Chilled Order', to: '/orders/new/chilled' },
              { label: 'Dry Groceries Order', to: '/orders/new/dry' },
              { label: 'Order History', to: '/orders' },
            ]}
          />
          <NavMenu
            label="Deliveries"
            active={pathname.startsWith('/deliveries')}
            items={[
              { label: 'Today', to: '/deliveries/today' },
              { label: 'Past', to: '/deliveries/past' },
            ]}
          />
        </nav>

        <div className="sm-nav__right">
          <Link to="/orders/new/chilled" aria-label="New chilled order" title="New chilled order">
            <TypeIcon type="chilled" size={48} title="New chilled order" />
          </Link>
          <Link to="/orders/new/dry" aria-label="New dry groceries order" title="New dry groceries order">
            <TypeIcon type="dry" size={48} title="New dry groceries order" />
          </Link>
          <div className="sm-nav__outlet">
            <span>{outlet.id}</span>
            <span>{outlet.city}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
