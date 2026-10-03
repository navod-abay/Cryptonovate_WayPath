import { Boxes,Fuel,Scale,Droplets } from 'lucide-react';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { today } from '../data/presentation';
import { RequestState,useApi } from '../data/useApi';
import type { Vehicle } from '../data/types';

export default function VehicleSpecifications({vehicle}:{vehicle:Vehicle}) {
  const date=today();
  const fuel=useApi(signal=>data.getVehicleFuel(vehicle.id,date,vehicle.warehouse,signal),[vehicle.id,vehicle.warehouse,date]);
  const value=(number:number|null|undefined,unit:string)=>number==null ? 'Unavailable' : `${number.toLocaleString('en-GB')} ${unit}`;
  return <section className="vehicle-specifications" aria-labelledby="vehicle-spec-title"><h2 id="vehicle-spec-title">Capacity & fuel</h2><RequestState resource={fuel} /><div className="vehicle-spec-grid">{[
    {label:'Weight capacity',value:value(vehicle.weightCapacityKg,'kg'),Icon:Scale},
    {label:'Volume capacity',value:value(vehicle.volumeCapacityM3,'m³'),Icon:Boxes},
    {label:'Weekly fuel quota',value:value(fuel.data?.quota ?? vehicle.weeklyFuelQuotaLitres,'L'),Icon:Fuel},
    {label:'Remaining fuel quota',value:value(fuel.data?.remaining,'L'),Icon:Droplets},
  ].map(metric=><div className="vehicle-spec-card" key={metric.label}><metric.Icon size={23} /><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</div></section>;
}
