import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { DEMO_DATE, DEMO_REAL_START, DEMO_START } from '../data/seed';
import { formatDate, Panel } from '../components/common';
import OrdersTable from '../components/OrdersTable';

export default function Upcoming() {
  const [now, setNow] = useState(() => DEMO_START + Date.now() - DEMO_REAL_START);
  useEffect(() => { const timer = window.setInterval(() => setNow(DEMO_START + Date.now() - DEMO_REAL_START), 1000); return () => clearInterval(timer); }, []);
  const orders = data.getOrders().filter(o => o.date > DEMO_DATE);
  const days = [...new Set(orders.map(o => o.date))].sort();
  return <main className="page"><div className="page-title"><h1>Upcoming Schedule</h1><span className="secondary">Orders awaiting the delivery cutoff</span></div><div className="upcoming-list">{days.map(date => {
    const cutoff = new Date(`${date}T16:00:00+05:30`).getTime() - 86400000;
    const remaining = Math.max(0, Math.floor((cutoff - now) / 1000));
    const left = `${Math.floor(remaining / 3600)}hr ${Math.floor(remaining % 3600 / 60)}mins ${remaining % 60}secs`;
    const group = orders.filter(o => o.date === date);
    return <Panel key={date}><div className="upcoming-heading"><div><h2>{formatDate(date, true)}</h2><span className="secondary">{group.length} orders</span></div><div className={`countdown ${remaining ? '' : 'closed'}`}><Clock size={23} /><span>{remaining ? `Closes at 16:00 on ${formatDate(new Date(cutoff).toISOString().slice(0, 10))}, in ${left}` : 'Order window closed'}</span></div></div><OrdersTable orders={group} /></Panel>;
  })}</div></main>;
}
