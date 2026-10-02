import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge, COLORS, ItemsListModal, OutletRow, PrimaryButton, WarehouseCard } from '@waypoint/ui';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { CategoryIcon, formatDate, Panel, VehicleIcon } from '../components/common';

export function BackButton({ fallback }: { fallback: string }) {
  const navigate = useNavigate();
  return <button className="back-button" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate(fallback)}><ArrowLeft size={20} /> Back</button>;
}
export function MissingRecord({ noun }: { noun: string }) {
  return <main className="page"><Panel><h1>{noun} not found</h1><p>That record is not included in the demo data.</p><Link className="text-link" to="/dispatcher">Back to Dashboard</Link></Panel></main>;
}
export function OrderDetails() {
  const { orderId } = useParams();
  const order = data.getOrders().find(o => o.id === orderId);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  if (!order) return <MissingRecord noun="Order" />;
  return <main className="page detail-page"><BackButton fallback="/dispatcher/orders" /><Panel><div className="detail-heading"><CategoryIcon category={order.category} /><h1>{order.id}</h1><Badge label={order.status} backgroundColor={order.status === 'Deferred' ? '#ffbfcb' : '#ccf2fb'} textColor={COLORS.textMain} /></div><dl className="detail-fields"><div><dt>Warehouse</dt><dd>{order.warehouse}</dd></div><div><dt>Destination</dt><dd>{order.destination}</dd></div><div><dt>Delivery date</dt><dd>{formatDate(order.date, true)}</dd></div>{order.reason && <div><dt>Reason for deferral</dt><dd>{order.reason}</dd></div>}</dl><h2>Order items</h2><dl className="item-list">{order.items.map(i => <div key={i.id}><dt>{i.name}</dt><dd>{i.expected}</dd></div>)}</dl><PrimaryButton title="View inventory checklist" onClick={() => setInventoryOpen(true)} style={{ width: 'auto', fontSize: 17 }} /></Panel><ItemsListModal visible={inventoryOpen} items={order.items} onClose={() => setInventoryOpen(false)} /></main>;
}
export function TripDetails() {
  const { tripId } = useParams();
  const vehicle = data.getVehicles().find(v => v.trips.some(t => t.id === tripId));
  const trip = vehicle?.trips.find(t => t.id === tripId);
  if (!trip || !vehicle) return <MissingRecord noun="Trip" />;
  return <main className="page detail-page"><BackButton fallback="/dispatcher/schedule/today" /><Panel><div className="detail-heading"><CategoryIcon category={trip.category} /><h1>{trip.destination} — {trip.stops.length} stops</h1></div><p className="secondary">{vehicle.id} · {trip.weight} kg · {trip.volume} m³</p><WarehouseCard title={`${vehicle.warehouse} Warehouse`} badgeText="DISPATCH" arriveTime="07:30" departTime="08:15" /><h2>Route legs</h2>{trip.stops.map((stop, i) => <OutletRow key={stop} node={{ id: `${trip.id}-${i}`, type: 'outlet', sequence: i + 1, title: stop, badgeText: 'SCHEDULED', location: trip.destination, scheduledStart: `${String(9 + i).padStart(2, '0')}:00`, scheduledEnd: `${String(9 + i).padStart(2, '0')}:30`, status: 'pending', inventory: [], logs: [] }} />)}</Panel></main>;
}
export function VehicleDetails() {
  const { vehicleId } = useParams();
  const vehicle = data.getVehicles().find(v => v.id === vehicleId);
  if (!vehicle) return <MissingRecord noun="Vehicle" />;
  return <main className="page detail-page"><BackButton fallback="/dispatcher/fleet" /><Panel><div className="detail-heading"><VehicleIcon vehicle={vehicle} /><h1>{vehicle.id}</h1></div><dl className="detail-fields"><div><dt>Warehouse</dt><dd>{vehicle.warehouse}</dd></div><div><dt>Vehicle type</dt><dd>{vehicle.kind}</dd></div><div><dt>Refrigerated</dt><dd>{vehicle.refrigerated ? 'Yes' : 'No'}</dd></div><div><dt>Availability today</dt><dd>{vehicle.available ? 'Available' : 'Unavailable'}</dd></div></dl><h2>Today’s trips</h2>{vehicle.trips.length ? vehicle.trips.map(t => <Link className="trip-detail-row" key={t.id} to={`/dispatcher/schedule/trips/${t.id}`}><CategoryIcon category={t.category} small /><span>{t.destination} — {t.stops.length} stops</span><span>{t.weight} kg · {t.volume} m³</span></Link>) : <p className="secondary">No trips assigned.</p>}</Panel></main>;
}
export function IncidentDetails() {
  const { incidentId } = useParams();
  const incident = data.getIncidents().find(i => i.id === incidentId);
  const location = useLocation();
  if (!incident) return <MissingRecord noun="Incident" />;
  return <main className="page detail-page" key={location.pathname}><BackButton fallback="/dispatcher" /><Panel><h1>{incident.source}</h1><p className="secondary">{incident.kind === 'driver' ? 'Driver report' : incident.kind === 'warehouse' ? 'Warehouse incident' : 'Store incident'}</p><p className="incident-detail">{incident.detail}</p>{incident.vehicleId && <Link className="text-link" to={`/dispatcher/fleet/${incident.vehicleId}`}>View vehicle and trips</Link>}</Panel></main>;
}
