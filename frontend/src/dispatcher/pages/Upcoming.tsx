import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { addDays, today } from '../data/presentation';
import { RequestState, useApi } from '../data/useApi';
import { EmptyState, formatDate, Panel } from '../components/common';
import OrdersTable from '../components/OrdersTable';

export default function Upcoming() {
  const date = today(), from = addDays(date,1), to = addDays(date,30);
  const orders = useApi(signal=>data.getOrders(from,to,signal),[from,to]);
  const windows = useApi(async signal=>({ ...await data.getWindows(from,to,signal),receivedAt:Date.now() }),[from,to]);
  const [now,setNow] = useState(Date.now());
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
  const serverNow = now + (windows.data ? Date.parse(windows.data.serverTime)-windows.data.receivedAt : 0);
  const days = [...new Set((orders.data || []).map(o=>o.date))].sort();
  return <main className="page"><div className="page-title"><h1>Upcoming Schedule</h1><span className="secondary">Orders for the next 30 days</span></div><RequestState resource={orders} /><RequestState resource={windows} />{orders.data && !days.length && <EmptyState text="No upcoming orders." />}<div className="upcoming-list">{days.map(date=>{
    const cutoff=windows.data?.days.find(d=>d.date===date)?.cutoffAt;
    const remaining=cutoff ? Math.max(0,Math.floor((Date.parse(cutoff)-serverNow)/1000)) : null;
    const group=(orders.data || []).filter(o=>o.date===date);
    return <Panel key={date}><div className="upcoming-heading"><div><h2>{formatDate(date,true)}</h2><span className="secondary">{group.length} orders</span></div><div className={`countdown ${remaining===0 ? 'closed' : ''}`}><Clock size={23} /><span>{remaining===null ? 'Cutoff information unavailable' : remaining===0 ? 'Order window closed' : `Cutoff in ${Math.floor(remaining/3600)}hr ${Math.floor(remaining%3600/60)}mins ${remaining%60}secs`}</span></div></div><OrdersTable orders={group} /></Panel>;
  })}</div></main>;
}
