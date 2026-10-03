import { useCallback, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { CaretDown, UserCircle } from '@phosphor-icons/react';
import { CATEGORY } from '@/config/categories';
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
              ...outlet.categories.map((c) => ({ label: `${CATEGORY[c].label.replace(/ Order$/, '')} Order`, to: `/orders/new/${c}` })),
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
          {outlet.categories.map((c) => (
            <Link key={c} to={`/orders/new/${c}`} aria-label={`New ${CATEGORY[c].short.toLowerCase()} order`} title={`New ${CATEGORY[c].short.toLowerCase()} order`}>
              <TypeIcon type={c} size={48} title={`New ${CATEGORY[c].short.toLowerCase()} order`} />
            </Link>
          ))}
          <div className="sm-nav__outlet">
            <span className="sm-nav__outlet-id">{outlet.id}</span>
            <span className="sm-nav__outlet-city">{outlet.city}</span>
          </div>
          <NavLink to="/profile" className={({ isActive }) => `sm-nav__profile${isActive ? ' is-active' : ''}`} aria-label="Your profile" title="Your profile">
            <UserCircle size={44} weight="light" />
          </NavLink>
        </div>
      </div>
    </header>
  );
}
