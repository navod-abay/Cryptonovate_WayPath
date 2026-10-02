import { useNavigate, Link } from 'react-router-dom';
import { Building2, ChevronDown, PersonStanding, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { categories } from '../data/seed';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { CategoryIcon, Panel } from '../components/common';
import DemandChart from '../components/DemandChart';

export default function Dashboard() {
  const navigate = useNavigate();
  const deferred = data.getOrders().filter(o => o.status === 'Deferred');
  return <>
    <div className="cutoff-banner">Orders for Mon, 28 Sep are closing at 16:00. 109 as of now.</div>
    <main className="page dashboard-grid">
      <div className="dashboard-main">
        <h1>Today’s Orders</h1>
        <div className="category-grid">{categories.map(c => <button key={c.id} className="category-card" style={{ background: c.surface }} onClick={() => navigate(`/dispatcher/orders?category=${c.id}`)}>
          <span className="category-heading"><CategoryIcon category={c.id} /><span>{c.label}</span><ChevronDown size={25} /></span>
          <strong className="category-count">{c.delivered}/{c.total}</strong><span className="secondary">Delivered</span>
        </button>)}</div>
        <div className="dashboard-lower">
          <div><h2>Stats - Past Week</h2><Panel className="stats">{[
            ['Deferred Orders', '12', '8%', true], ['Damaged Items', '28', '3%', false], ['Missing Items', '04', '8%', false],
          ].map(([label, count, percentage, rising]) => <div key={String(label)}><span>{label}</span><strong>{count}</strong><span>{percentage} {rising ? <TrendingUp className="danger" size={23} /> : <TrendingDown className="success" size={23} />}</span></div>)}</Panel>
          <div className="section-title"><h2>Deferred Orders ({deferred.length})</h2><Link className="text-link" to="/dispatcher/orders?status=Deferred">View All</Link></div>
          <div className="deferred-list">{deferred.slice(0, 3).map(o => <div key={o.id} className="deferred-row"><strong>{o.id}</strong><CategoryIcon category={o.category} small /><Link className="text-link" to={`/dispatcher/orders/${o.id}`}>View</Link></div>)}</div>
          </div>
          <div><h2>Item Demand — Next Week</h2><DemandChart /></div>
        </div>
      </div>
      <aside className="alerts panel soft"><h2>Alerts</h2><div className="alert-list">{data.getIncidents().map(a => {
        const Icon = a.kind === 'driver' ? Truck : a.kind === 'store' ? Building2 : PersonStanding;
        return <Link key={a.id} className="alert-row" to={`/dispatcher/incidents/${a.id}`}><Icon size={28} strokeWidth={1.5} /><span><strong>{a.source}</strong><span className="alert-summary">{a.summary}</span></span><time>{a.minutesAgo < 60 ? `${a.minutesAgo}mins` : `${a.minutesAgo / 60}hrs`} ago</time></Link>;
      })}</div></aside>
    </main>
  </>;
}
