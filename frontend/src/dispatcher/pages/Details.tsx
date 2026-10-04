import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import VehicleSpecifications from '../components/VehicleSpecifications';
import VehicleAvailability from '../components/VehicleAvailability';
import { Badge, COLORS, OutletRow } from '@waypoint/ui';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { RequestState, useApi } from '../data/useApi';
import { today } from '../data/presentation';
import type { Warehouse } from '../data/types';
import { CategoryIcon, formatDate, isValidDate, Panel, VehicleIcon } from '../components/common';

export function BackButton({ fallback }: { fallback:string }) {
  const navigate=useNavigate();
  return <button className="back-button" onClick={()=>window.history.state?.idx>0 ? navigate(-1) : navigate(fallback)}><ArrowLeft size={20} /> Back</button>;
}
export function MissingRecord({ noun }: { noun:string }) {
  return <main className="page"><Panel><h1>{noun} not found</h1><p>This record is unavailable.</p><Link className="text-link" to="/dispatcher">Back to Dashboard</Link></Panel></main>;
}
export function OrderDetails() {
  const {orderId}=useParams(); const resource=useApi(signal=>data.getOrder(orderId!,signal),[orderId]);
  const order=resource.data;
  return <main className="page detail-page"><BackButton fallback="/dispatcher/orders" /><RequestState resource={resource} />{order && <Panel><div className="detail-heading"><CategoryIcon category={order.category} /><h1>{order.id}</h1><Badge label={order.backendStatus || order.status} backgroundColor={order.status==='Deferred' ? '#ffbfcb' : '#ccf2fb'} textColor={COLORS.textMain} /></div><dl className="detail-fields"><div><dt>Outlet</dt><dd>{order.outletId}</dd></div><div><dt>Warehouse</dt><dd>{order.warehouse}</dd></div><div><dt>Destination</dt><dd>{order.destination}</dd></div><div><dt>Delivery date</dt><dd>{formatDate(order.date,true)}</dd></div>{order.reason && <div><dt>Reason</dt><dd>{order.reason}</dd></div>}</dl><h2>Ordered quantities</h2><dl className="item-list">{order.items.map(i=><div key={i.id}><dt>{i.name}</dt><dd>{i.expected}</dd></div>)}</dl>{!order.items.length && <p>No order items.</p>}</Panel>}</main>;
}
function useScheduleContext() {
  const [params]=useSearchParams();
  const date=isValidDate(params.get('date')) ? params.get('date')! : today();
  const warehouse:Warehouse=params.get('warehouse')==='Kandy' ? 'Kandy' : 'Peliyagoda';
  return {date,warehouse};
}
export function TripDetails() {
  const {tripId}=useParams(); const {date,warehouse}=useScheduleContext();
  const resource=useApi(signal=>data.getSchedule(date,warehouse,signal),[date,warehouse]);
  const vehicle=resource.data?.vehicles.find(v=>v.trips.some(t=>t.id===tripId));
  const trip=vehicle?.trips.find(t=>t.id===tripId);
  if (resource.data && (!trip || !vehicle)) return <MissingRecord noun="Trip" />;
  return <main className="page detail-page"><BackButton fallback="/dispatcher/schedule/today" /><RequestState resource={resource} />{trip && vehicle && <Panel>{resource.data?.sample && <p className="data-notice">Planning service sample schedule</p>}<div className="detail-heading"><CategoryIcon category={trip.category} /><h1>{trip.destination} — {trip.stops.length} stops</h1></div><p className="secondary">{vehicle.id} · {trip.weight} kg · {trip.volume} m³</p><dl className="detail-fields"><div><dt>Depot</dt><dd>{vehicle.warehouse}</dd></div><div><dt>Date</dt><dd>{formatDate(date,true)}</dd></div><div><dt>Departure</dt><dd>{trip.departure || 'Unavailable'}</dd></div><div><dt>Return</dt><dd>{trip.returnTime || 'Unavailable'}</dd></div></dl><h2>Route legs</h2>{trip.stopDetails?.map((stop,i)=><div key={`${stop.orderRef}-${i}`}><OutletRow node={{id:`${trip.id}-${i}`,type:'outlet',sequence:i+1,title:stop.outletId,badgeText:'PLANNED',location:trip.destination,scheduledStart:stop.windowOpen,scheduledEnd:stop.windowClose,status:'pending',inventory:[],logs:[]}} /><p className="secondary">ETA: {stop.eta || 'Unavailable'} · <Link className="text-link" to={`/dispatcher/orders/${encodeURIComponent(stop.orderRef)}`}>{stop.orderRef}</Link></p></div>)}</Panel>}</main>;
}
export function VehicleDetails() {
  const {vehicleId}=useParams(); const date=today();
  const resource=useApi(signal=>data.getVehicles(signal),[]);
  const vehicle=resource.data?.find(v=>v.id===vehicleId);
  const schedule=useApi(signal=>vehicle ? data.getSchedule(date,vehicle.warehouse,signal) : Promise.resolve(undefined),[date,vehicle?.warehouse]);
  if (resource.data && !vehicle) return <MissingRecord noun="Vehicle" />;
  const trips=schedule.data?.vehicles.find(v=>v.id===vehicleId)?.trips || [];
  return <main className="page detail-page"><BackButton fallback="/dispatcher/fleet" /><RequestState resource={resource} />{vehicle && <Panel><div className="detail-heading"><VehicleIcon vehicle={vehicle} /><h1>{vehicle.id}</h1></div><dl className="detail-fields"><div><dt>Warehouse</dt><dd>{vehicle.warehouse}</dd></div><div><dt>Vehicle type</dt><dd>{vehicle.kind}</dd></div><div><dt>Refrigerated</dt><dd>{vehicle.refrigerated ? 'Yes' : 'No'}</dd></div><div><dt>Availability</dt><dd><VehicleAvailability vehicle={vehicle} /></dd></div></dl><VehicleSpecifications vehicle={vehicle} /><h2>Today’s trips</h2><RequestState resource={schedule} />{schedule.data?.sample && <p className="data-notice">Planning service sample schedule</p>}{trips.map(t=><Link className="trip-detail-row" key={t.id} to={`/dispatcher/schedule/trips/${encodeURIComponent(t.id)}?date=${date}&warehouse=${vehicle.warehouse}`}><CategoryIcon category={t.category} small /><span>{t.destination} — {t.stops.length} stops</span><span>{t.weight} kg · {t.volume} m³</span></Link>)}{schedule.data && !trips.length && <p className="secondary">No trips assigned.</p>}</Panel>}</main>;
}
export function IncidentDetails() {
  const {incidentId}=useParams(); const resource=useApi(signal=>data.getIncident(incidentId!,signal),[incidentId]);
  const incident=resource.data;
  return <main className="page detail-page"><BackButton fallback="/dispatcher" /><RequestState resource={resource} />{incident && <Panel><h1>{incident.source}</h1><p className="secondary">{incident.kind==='driver' ? 'Driver report' : incident.kind==='warehouse' ? 'Warehouse incident' : 'Store incident'}</p><p className="incident-detail">{incident.detail}</p>{incident.vehicleId && <Link className="text-link" to={`/dispatcher/fleet/${encodeURIComponent(incident.vehicleId)}`}>View vehicle and trips</Link>}{incident.orderId && <Link className="text-link" to={`/dispatcher/orders/${encodeURIComponent(incident.orderId)}`}>View order</Link>}</Panel>}</main>;
}
