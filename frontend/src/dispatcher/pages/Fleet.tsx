import { useState } from 'react';
import { useSearchParams,Link } from 'react-router-dom';
import { PrimaryButton } from '@waypoint/ui';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { RequestState,useApi } from '../data/useApi';
import type { Vehicle } from '../data/types';
import { CategoryIcon,EmptyState,Panel,VehicleIcon } from '../components/common';
import VehicleAvailability from '../components/VehicleAvailability';
import AvailabilityDialog from '../components/AvailabilityDialog';

export default function Fleet() {
  const [params,setParams]=useSearchParams();
  const warehouse=params.get('warehouse') || '';
  const resource=useApi(signal=>data.getVehicles(signal),[]);
  const vehicles=(resource.data || []).filter(v=>!warehouse || v.warehouse===warehouse);
  const [selected,setSelected]=useState<Vehicle|null>(null),[message,setMessage]=useState('');
  return <main className="page"><div className="page-title"><h1>Fleet</h1><span className="secondary">Vehicles and today’s trips</span></div>
    {message && <p className="save-notice" role="status">{message}</p>}
    <Panel><div className="filters"><label>Warehouse<select value={warehouse} onChange={event=>setParams(event.target.value ? {warehouse:event.target.value} : {})}><option value="">All warehouses</option><option>Peliyagoda</option><option>Kandy</option></select></label></div><RequestState resource={resource} />
      <div className="table-scroll"><table className="orders-table fleet-table"><thead><tr><th>Vehicle</th><th>Warehouse</th><th>Refrigeration</th><th>Availability</th><th>Trips</th><th><span className="sr-only">Manage availability</span></th></tr></thead><tbody>{vehicles.map(vehicle=><tr key={vehicle.id}>
        <td><Link className="vehicle-label" to={`/dispatcher/fleet/${vehicle.id}`}><VehicleIcon vehicle={vehicle} />{vehicle.id}</Link></td><td>{vehicle.warehouse}</td><td>{vehicle.refrigerated ? <CategoryIcon category="chilled" small /> : '—'}</td>
        <td><VehicleAvailability vehicle={vehicle} />{vehicle.available && !!vehicle.unavailablePeriods?.length && <span className="planned-periods">{vehicle.unavailablePeriods.length} scheduled unavailable {vehicle.unavailablePeriods.length===1 ? 'period' : 'periods'}</span>}</td><td>{vehicle.tripsLoaded ? vehicle.trips.length : '—'}</td>
        <td><PrimaryButton title="Change availability" variant="outline" onClick={()=>{setSelected(vehicle);setMessage('');}} style={{width:'auto',fontSize:15,padding:'9px 12px',whiteSpace:'nowrap'}} /></td>
      </tr>)}</tbody></table></div>{resource.data && !vehicles.length && <EmptyState text="No vehicles match this warehouse." />}
    </Panel>{selected && <AvailabilityDialog vehicle={selected} onClose={()=>setSelected(null)} onSaved={()=>{setMessage(`Availability updated for ${selected.id}.`);resource.retry();}} />}
  </main>;
}
