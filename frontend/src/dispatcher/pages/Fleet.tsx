import { useSearchParams, Link } from 'react-router-dom';
import { Badge, COLORS } from '@waypoint/ui';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { CategoryIcon, EmptyState, Panel, VehicleIcon } from '../components/common';

export default function Fleet() {
  const [params, setParams] = useSearchParams();
  const warehouse = params.get('warehouse') || '';
  const vehicles = data.getVehicles().filter(v => !warehouse || v.warehouse === warehouse);
  return <main className="page"><div className="page-title"><h1>Fleet</h1><span className="secondary">Vehicles and today’s trips</span></div><Panel><div className="filters"><label>Warehouse<select value={warehouse} onChange={e => setParams(e.target.value ? { warehouse: e.target.value } : {})}><option value="">All warehouses</option><option>Peliyagoda</option><option>Kandy</option></select></label></div><div className="table-scroll"><table className="orders-table"><thead><tr><th>Vehicle</th><th>Warehouse</th><th>Refrigeration</th><th>Availability</th><th>Trips</th></tr></thead><tbody>{vehicles.map(v => <tr key={v.id}><td><Link className="vehicle-label" to={`/dispatcher/fleet/${v.id}`}><VehicleIcon vehicle={v} />{v.id}</Link></td><td>{v.warehouse}</td><td>{v.refrigerated ? <CategoryIcon category="chilled" small /> : '—'}</td><td><Badge label={v.available ? 'Available' : 'Unavailable'} backgroundColor={v.available ? '#b4f8d0' : '#ffbfcb'} textColor={COLORS.textMain} /></td><td>{v.trips.length}</td></tr>)}</tbody></table></div>{!vehicles.length && <EmptyState text="No vehicles match this warehouse." />}</Panel></main>;
}
