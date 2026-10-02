import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, COLORS } from '@waypoint/ui';
import { CalendarCheck, Fuel, Milk, Truck } from 'lucide-react';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { categories, DEMO_DATE } from '../data/seed';
import { CategoryIcon, EmptyState, formatDate, isValidDate, Panel, VehicleIcon } from '../components/common';
import OrderAccordion from '../components/OrderAccordion';

export default function Schedule() {
  const [params, setParams] = useSearchParams();
  const warehouse = params.get('warehouse') === 'Kandy' ? 'Kandy' : 'Peliyagoda';
  const requestedDate = params.get('date');
  const date = isValidDate(requestedDate) ? requestedDate : DEMO_DATE;
  const [expanded, setExpanded] = useState<string | null>(null);
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); setParams(next); setExpanded(null); };
  const vehicles = date === DEMO_DATE ? data.getVehicles().filter(v => v.warehouse === warehouse && v.trips.length) : [];
  const deferred = data.getOrders().filter(o => o.date === date && o.warehouse === warehouse && ['OUT006', 'OUT017', 'OUT009'].includes(o.id));
  return <main className="page schedule-page">
    <div className="warehouse-summaries">{(['Peliyagoda', 'Kandy'] as const).map(name => <Panel key={name} className="warehouse-summary">{['Orders', 'Vehicles', 'Trips'].map((label, i) => <div key={label}><span>{name.toUpperCase()}</span><div><strong>{(name === 'Kandy' ? [18, 12, 12] : [80, 36, 71])[i]}</strong><span>{label}</span></div></div>)}</Panel>)}</div>
    <div className="schedule-grid">
      <Panel className="schedule-board">
        <div className="schedule-heading"><h1>Schedule</h1><label className="warehouse-picker"><span className="sr-only">Warehouse</span><select value={warehouse} onChange={e => change('warehouse', e.target.value)}><option>Peliyagoda</option><option>Kandy</option></select></label>
          <label className="date-picker"><span>for {formatDate(date, true)}</span><CalendarCheck size={31} /><input aria-label="Schedule date" type="date" value={date} onChange={e => { if (e.target.value) change('date', e.target.value); }} /></label>
        </div>
        <div className="table-scroll"><table className="schedule-table"><thead><tr><th>Vehicle</th><th>Trip 1</th><th>Trip 2</th></tr></thead><tbody>{vehicles.map(vehicle => <tr key={vehicle.id}>
          <td><Link className="vehicle-label" to={`/dispatcher/fleet/${vehicle.id}`}><span>{vehicle.id}</span><VehicleIcon vehicle={vehicle} />{vehicle.refrigerated && <CategoryIcon category="chilled" small />}</Link></td>
          {[0, 1].map(i => <td key={i}>{vehicle.trips[i] ? <><Link className="trip-link" aria-label={`${vehicle.id} trip ${i + 1}: ${vehicle.trips[i].destination}`} to={`/dispatcher/schedule/trips/${vehicle.trips[i].id}`}><Badge className="trip-badge" label={`${vehicle.trips[i].destination} - ${vehicle.trips[i].stops.length} stops`} backgroundColor={categories.find(c => c.id === vehicle.trips[i].category)!.color} textColor={COLORS.textMain} /></Link><div className="trip-load">• {vehicle.trips[i].weight} kg <span>• {vehicle.trips[i].volume} m³</span></div></> : <span className="dash">-</span>}</td>)}
        </tr>)}</tbody></table></div>
        {!vehicles.length && <EmptyState text="No trips scheduled for this warehouse on the selected day." />}
      </Panel>
      <aside className="schedule-side">
        <Panel className="soft metrics"><h2>Schedule Metrics</h2>{[
          { Icon: Truck, value: warehouse === 'Kandy' ? '67%' : '75%', label: 'Fleet Utilization' },
          { Icon: Fuel, value: warehouse === 'Kandy' ? '68%' : '75%', label: 'Weight Utilization' },
          { Icon: Milk, value: '10%', label: 'Weekly Fuel Quota Used' },
        ].map(({ Icon, value, label }) => <div className="metric-row" key={label}><Icon size={28} strokeWidth={1.5} /><span><strong>{vehicles.length ? value : '0%'}</strong><span>{label}</span></span></div>)}</Panel>
        <Panel className="soft unallocated"><h2>Unallocated Orders</h2>{deferred.map(order => <OrderAccordion key={order.id} order={order} expanded={expanded === order.id} onToggle={() => setExpanded(expanded === order.id ? null : order.id)} />)}{!deferred.length && <EmptyState text="No unallocated orders for this day." />}</Panel>
      </aside>
    </div>
  </main>;
}
