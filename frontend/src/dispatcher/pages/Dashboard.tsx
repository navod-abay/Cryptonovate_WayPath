import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, PersonStanding, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { addDays, categories, today } from '../data/presentation';
import { RequestState, useApi } from '../data/useApi';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { CategoryIcon, EmptyState, formatDate, Panel } from '../components/common';
import DemandChart from '../components/DemandChart';
import { mergeIncidents, subscribeAlerts } from '../data/alertStream';
import type { Incident } from '../data/types';

const ago = (minutes: number) => minutes < 60 ? `${minutes}mins` : `${Math.floor(minutes / 60)}hrs`;

export default function Dashboard() {
  const navigate = useNavigate();
  const date = today();
  const overview = useApi(signal=>data.getOverview(date,signal),[date]);
  const orders = useApi(signal=>data.getOrders(date,date,signal),[date]);
  const stats = useApi(signal=>data.getStatistics(date,signal),[date]);
  const incidents = useApi(signal=>data.getIncidents(signal),[]);
  // Alerts pushed since the last poll; the poll (every minute) remains the fallback.
  const [live, setLive] = useState<Incident[]>([]);
  useEffect(() => subscribeAlerts({
    onAlerts: alerts => setLive(current => mergeIncidents(alerts, current)),
    onReady: () => { data.getIncidents().then(list => setLive(current => mergeIncidents(current, list))).catch(() => undefined); },
  }), []);
  const alerts = mergeIncidents(incidents.data || [], live);
  const windows = useApi(signal=>data.getWindows(addDays(date,1),addDays(date,14),signal),[date]);
  const deferred = (orders.data || []).filter(o => o.status === 'Deferred');
  const next = windows.data?.days.find(d=>Date.parse(d.cutoffAt)>Date.now()) || windows.data?.days[0];
  return <>
    <div className="cutoff-banner">{next ? `Orders for ${formatDate(next.date)} close at ${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(next.cutoffAt))} on ${formatDate(new Date(Date.parse(next.cutoffAt)+19800000).toISOString().slice(0,10))}.` : 'Order window information'}<RequestState resource={windows} /></div>
    <main className="page dashboard-grid">
      <div className="dashboard-main">
        <h1>Today’s Orders</h1>
        <RequestState resource={overview} />
        <div className="category-grid">{categories.map(c => <button key={c.id} className="category-card" style={{ background: c.surface }} onClick={() => navigate(`/dispatcher/orders?category=${c.id}`)}>
          <span className="category-heading"><CategoryIcon category={c.id} /><span>{c.label}</span></span>
          <strong className="category-count">{overview.data ? `${overview.data.categories.find(r=>r.category===c.id)?.delivered ?? 0}/${overview.data.categories.find(r=>r.category===c.id)?.total ?? 0}` : '—'}</strong><span className="secondary">Delivered</span>
        </button>)}</div>
        <div className="dashboard-lower">
          <div><h2>Stats - Past Week</h2><RequestState resource={stats} /><Panel className="stats">{(stats.data?.metrics || []).map(metric => <div key={metric.key}><span>{metric.key==='deferred' ? 'Deferred Orders' : metric.key==='damaged' ? 'Damaged Items' : 'Missing Items'}</span><strong title={metric.current===null ? 'Some reports do not record damaged quantities' : undefined}>{metric.current ?? '—'}</strong><span>{metric.changePercent===null ? '—' : `${Math.abs(metric.changePercent)}%`} {metric.changePercent!==null && metric.changePercent!==0 && (metric.changePercent>0 ? <TrendingUp className="danger" size={23} /> : <TrendingDown className="success" size={23} />)}</span></div>)}</Panel>
          <div className="section-title"><h2>Deferred Orders ({orders.data ? deferred.length : '—'})</h2><Link className="text-link" to="/dispatcher/orders?status=Deferred">View All</Link></div>
          <RequestState resource={orders} /><div className="deferred-list">{deferred.slice(0, 3).map(o => <div key={o.id} className="deferred-row"><strong>{o.outletId || o.id}</strong><CategoryIcon category={o.category} small /><Link className="text-link" to={`/dispatcher/orders/${o.id}`}>View</Link></div>)}</div>{orders.data && !deferred.length && <EmptyState text="No deferred orders today." />}
          </div>
          <div><h2>Item Demand — Next Week</h2><DemandChart /></div>
        </div>
      </div>
      <aside className="alerts panel soft"><h2>Alerts</h2><RequestState resource={incidents} />{incidents.data && !alerts.length && <EmptyState text="No incidents reported." />}<div className="alert-list">{alerts.map(a => {
        const Icon = a.kind === 'driver' ? Truck : a.kind === 'store' ? Building2 : PersonStanding;
        return <Link key={a.id} className="alert-row" to={`/dispatcher/incidents/${a.id}`}><Icon size={28} strokeWidth={1.5} /><span><strong>{a.source}</strong><span className="alert-summary">{a.summary}</span></span><span className="alert-when"><time>{ago(a.minutesAgo)} ago</time>{a.syncedLate && a.receivedMinutesAgo !== undefined && <span className="alert-late" title="Queued on the device while offline">synced {ago(a.receivedMinutesAgo)} ago</span>}</span></Link>;
      })}</div></aside>
    </main>
  </>;
}
