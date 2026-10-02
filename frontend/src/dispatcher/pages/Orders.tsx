import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PrimaryButton } from '@waypoint/ui';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { categories, DEMO_DATE } from '../data/seed';
import { Panel } from '../components/common';
import OrdersTable from '../components/OrdersTable';

export default function Orders() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || ''; const category = params.get('category') || ''; const status = params.get('status') || '';
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next, { replace: true }); };
  const orders = data.getOrders().filter(o => o.date === DEMO_DATE && (!category || o.category === category) && (!status || o.status === status) && `${o.id} ${o.destination} ${o.warehouse}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="page"><div className="page-title"><h1>Today’s Orders</h1><span className="secondary">28 September 2026</span></div><Panel><div className="filters"><label className="search-field"><Search size={20} /><input aria-label="Search orders" placeholder="Search order, outlet or warehouse" value={query} onChange={e => change('q', e.target.value)} /></label><label>Category<select value={category} onChange={e => change('category', e.target.value)}><option value="">All categories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label><label>Status<select value={status} onChange={e => change('status', e.target.value)}><option value="">All statuses</option>{['Delivered', 'Scheduled', 'Deferred'].map(s => <option key={s}>{s}</option>)}</select></label><PrimaryButton title="Clear filters" variant="outline" style={{ width: 'auto', fontSize: 16, padding: '10px 16px' }} onClick={() => setParams({})} /></div><p className="secondary result-count" aria-live="polite">{orders.length} orders</p><OrdersTable orders={orders} /></Panel></main>;
}
