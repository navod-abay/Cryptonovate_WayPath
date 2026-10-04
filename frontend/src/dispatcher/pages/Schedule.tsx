import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, COLORS } from '@waypoint/ui';
import { CalendarCheck, Fuel, Milk, Truck } from 'lucide-react';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { categories, today } from '../data/presentation';
import { RequestState, useApi } from '../data/useApi';
import { CategoryIcon, EmptyState, formatDate, isValidDate, Panel, VehicleIcon } from '../components/common';
import OrderAccordion from '../components/OrderAccordion';
import { isScheduleAvailable } from '../data/scheduleAvailability';
import { addDays } from '../data/presentation';
import type { Warehouse } from '../data/types';

export default function Schedule() {
  const [params, setParams] = useSearchParams();
  const warehouse = params.get('warehouse') === 'Kandy' ? 'Kandy' : 'Peliyagoda';
  const requestedDate = params.get('date');
  const date = isValidDate(requestedDate) ? requestedDate : today();
  const [now,setNow] = useState(()=>new Date());
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(new Date()),1000);
    return ()=>window.clearInterval(timer);
  },[]);
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next); };
  if (!isScheduleAvailable(date,now)) return <main className="page schedule-page"><Panel className="schedule-board">
    <ScheduleHeading date={date} warehouse={warehouse} change={change} />
    <div className="schedule-unavailable" role="status"><CalendarCheck size={48} strokeWidth={1.5} /><h2>Schedule not available yet</h2><p>The schedule for {formatDate(date,true)} is prepared after 5 PM on {formatDate(addDays(date,-1),true)} (Sri Lanka time).</p><p className="secondary">You can view upcoming orders while waiting for the schedule.</p><Link className="text-link" to="/dispatcher/schedule/upcoming">View upcoming orders</Link></div>
  </Panel></main>;
  return <AvailableSchedule key={`${date}-${warehouse}`} date={date} warehouse={warehouse} change={change} />;
}

type ScheduleProps = {date:string;warehouse:Warehouse;change:(key:string,value:string)=>void};
function ScheduleHeading({date,warehouse,change}:ScheduleProps) {
  return <div className="schedule-heading"><h1>Schedule</h1><label className="warehouse-picker"><span className="sr-only">Warehouse</span><select value={warehouse} onChange={e => change('warehouse', e.target.value)}><option>Peliyagoda</option><option>Kandy</option></select></label>
    <label className="date-picker"><span>for {formatDate(date, true)}</span><CalendarCheck size={31} /><input aria-label="Schedule date" type="date" value={date} onChange={e => { if (e.target.value) change('date', e.target.value); }} /></label>
  </div>;
}

function AvailableSchedule({date,warehouse,change}:ScheduleProps) {
  const resource = useApi(signal=>data.getSchedule(date,warehouse,signal),[date,warehouse]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const vehicles = resource.data?.vehicles || [];
  const deferred = resource.data?.deferred || [];
  return <main className="page schedule-page">
    <RequestState resource={resource} />{resource.data?.sample && <p className="data-notice" role="status">Planning is returning a sample schedule. These trips are not generated from live orders.</p>}
    <div className="warehouse-summaries">{(['Peliyagoda', 'Kandy'] as const).map(name => {const summary=resource.data?.summaries.find(s=>s.depot===name);return <Panel key={name} className="warehouse-summary">{['Orders', 'Vehicles', 'Trips'].map((label, i) => <div key={label}><span>{name.toUpperCase()}</span><div><strong>{summary ? [summary.ordersServed+summary.ordersDeferred,summary.vehiclesAvailable,summary.trips][i] : '—'}</strong><span>{label}</span></div></div>)}</Panel>;})}</div>
    <div className="schedule-grid">
      <Panel className="schedule-board">
        <ScheduleHeading date={date} warehouse={warehouse} change={change} />
        <div className="table-scroll"><table className="schedule-table"><thead><tr><th>Vehicle</th><th>Trip 1</th><th>Trip 2</th></tr></thead><tbody>{vehicles.map(vehicle => <tr key={vehicle.id}>
          <td><Link className="vehicle-label" to={`/dispatcher/fleet/${vehicle.id}`}><span>{vehicle.id}</span><VehicleIcon vehicle={vehicle} />{vehicle.refrigerated && <CategoryIcon category="chilled" small />}</Link></td>
          {[0, 1].map(i => <td key={i}>{vehicle.trips[i] ? <><Link className="trip-link" aria-label={`${vehicle.id} trip ${i + 1}: ${vehicle.trips[i].destination}`} to={`/dispatcher/schedule/trips/${vehicle.trips[i].id}?date=${date}&warehouse=${warehouse}`}><Badge className="trip-badge" label={`${vehicle.trips[i].destination} - ${vehicle.trips[i].stops.length} stops`} backgroundColor={categories.find(c => c.id === vehicle.trips[i].category)!.color} textColor={COLORS.textMain} /></Link><div className="trip-load">• {vehicle.trips[i].weight} kg <span>• {vehicle.trips[i].volume} m³</span></div></> : <span className="dash">-</span>}</td>)}
        </tr>)}</tbody></table></div>
        {resource.data && !vehicles.length && <EmptyState text="No trips scheduled for this warehouse on the selected day." />}
      </Panel>
      <aside className="schedule-side">
        <Panel className="soft metrics"><h2>Schedule Metrics</h2>{[
          { Icon: Truck, value: resource.data?.summaries.find(s=>s.depot===warehouse)?.fleetUtilization, label: 'Fleet Utilization' },
          { Icon: Fuel, value: resource.data?.summaries.find(s=>s.depot===warehouse)?.weightUtilization, label: 'Weight Utilization' },
          { Icon: Milk, value: resource.data?.fuel, label: 'Weekly Fuel Quota Used' },
        ].map(({ Icon, value, label }) => <div className="metric-row" key={label}><Icon size={28} strokeWidth={1.5} /><span><strong>{value==null ? '—' : `${Math.round(value*100)}%`}</strong><span>{label}</span></span></div>)}{resource.data?.fuelError && <p role="alert">{resource.data.fuelError}</p>}</Panel>
        <Panel className="soft unallocated"><h2>Deferred Orders</h2>{deferred.map(order => <OrderAccordion key={order.id} order={order} expanded={expanded === order.id} onToggle={() => setExpanded(expanded === order.id ? null : order.id)} />)}{resource.data && !deferred.length && <EmptyState text="No deferred orders for this day." />}</Panel>
      </aside>
    </div>
  </main>;
}
