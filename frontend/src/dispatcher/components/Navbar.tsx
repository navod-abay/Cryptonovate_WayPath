import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location]);
  useEffect(() => {
    if (!open) return;
    const click = (e: PointerEvent) => { if (!container.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); container.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('keydown', key); };
  }, [open]);
  const linkClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;
  return <header className="navbar"><div className="navbar-inner">
    <Link className="brand" to="/dispatcher">WayPath</Link>
    <nav aria-label="Dispatcher navigation">
      <NavLink className={linkClass} end to="/dispatcher">Dashboard</NavLink>
      <div ref={container} className="nav-menu">
        <button className={`nav-link${location.pathname.includes('/schedule') ? ' active' : ''}`} aria-expanded={open} aria-controls="schedule-menu" onClick={() => setOpen(!open)}>Schedule <ChevronDown size={24} /></button>
        {open && <div className="nav-dropdown" id="schedule-menu"><Link to="/dispatcher/schedule/today">Today</Link><Link to="/dispatcher/schedule/upcoming">Upcoming</Link></div>}
      </div>
      <NavLink className={linkClass} to="/dispatcher/orders">Orders</NavLink>
      <NavLink className={linkClass} to="/dispatcher/fleet">Fleet</NavLink>
    </nav>
  </div></header>;
}
