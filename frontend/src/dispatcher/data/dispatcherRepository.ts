import { request } from './http';
import { today } from './presentation';
import { availabilityOn,normalizePeriods,readLocalAvailability } from './availability';
import type { AvailabilityUpdate, Category, Incident, Order, Trip, Vehicle, Warehouse } from './types';

export interface ApiOrder {
  order_ref:string;outlet_id:string;brand:string;temp_requirement:string;depot:Warehouse;order_date:string;status:string;
  items?: { id:string;description:string;quantity:number }[];
  events?: { reason_note?:string;reason_code?:string }[];
}
interface ApiTrip { tripId:string;tripNumber:number;brand:string;district:string;weightKg:number;volumeM3:number;departureTime:string;returnTime:string;stops:{ outletId:string;orderRef:string;temperature:string;eta:string;windowOpen:string;windowClose:string }[] }
interface ApiVehicle { vehicle_id:string;depot:Warehouse;type:'van'|'truck';temp:string;status:string;trips?:ApiTrip[];weight_cap_kg?:number;volume_cap_m3?:number;weekly_fuel_quota_l?:number;unavailable_periods?:AvailabilityUpdate['unavailable_periods'] }
interface ApiSchedule { date:string;depot:Warehouse;planRunId?:string;vehicles:{ vehicleId:string;type:'van'|'truck';temperature:string;trips:ApiTrip[] }[] }
interface Deferral { orderRef:string;outletId:string;depot:Warehouse;district:string;brand:string;temperature:string;reasonDetail:string }
export interface DepotSummary { depot:Warehouse;vehiclesAvailable:number;vehiclesUsed:number;trips:number;fleetUtilization:number;weightUtilization:number;ordersServed:number;ordersDeferred:number }
export interface Windows { serverTime:string;days:{ date:string;cutoffAt:string;open:boolean }[] }
export interface Overview { date:string;categories:{ category:Category;total:number;delivered:number }[] }
export interface Statistics { period:{from:string;to:string};metrics:{key:string;current:number|null;previous:number|null;changePercent:number|null}[] }
export interface Forecast { method:string;unit:string;note:string;days:{date:string;categories:{category:Category;predictedUnits:number|null}[]}[] }

export function categoryOf(brand:string,temp:string): Category {
  if (brand === 'Fresh') return temp === 'chilled' ? 'chilled' : 'dry';
  if (brand === 'Tech') return 'tech';
  if (brand === 'Style') return 'style';
  throw new Error(`Unsupported order brand: ${brand}`);
}
export function mapOrder(o:ApiOrder,destination='—'):Order {
  const reason = o.events?.slice().reverse().find(e=>e.reason_note || e.reason_code);
  const status:Order['status'] = ['delivered','received'].includes(o.status) ? 'Delivered' : o.status==='disputed' ? 'Disputed' : o.status==='cancelled' ? 'Cancelled' : o.status==='not_run' ? 'Not run' : o.status === 'deferred' ? 'Deferred' : ['allocated','loaded','out_for_delivery'].includes(o.status) ? 'Scheduled' : 'Pending';
  return { id:o.order_ref,outletId:o.outlet_id,warehouse:o.depot,date:o.order_date,category:categoryOf(o.brand,o.temp_requirement),
    destination,status,backendStatus:o.status,reason:reason?.reason_note || reason?.reason_code,
    itemsLoaded:!!o.items,items:(o.items || []).map(i=>({id:i.id,name:i.description,expected:i.quantity})) };
}
function mapTrip(t:ApiTrip):Trip {
  return { id:t.tripId,destination:t.district,category:categoryOf(t.brand,t.stops.some(s=>s.temperature==='chilled') ? 'chilled' : 'ambient'),weight:t.weightKg,volume:t.volumeM3,
    stops:t.stops.map(s=>s.outletId),stopDetails:t.stops,departure:t.departureTime,returnTime:t.returnTime };
}
function mapSchedule(s:ApiSchedule):Vehicle[] {
  return s.vehicles.map(v=>({id:v.vehicleId,warehouse:s.depot,kind:v.type,refrigerated:v.temperature==='reefer',available:true,trips:v.trips.map(mapTrip),tripsLoaded:true}));
}
async function getOrders(from=today(),to=from,signal?:AbortSignal):Promise<Order[]> {
  const orders:ApiOrder[]=[]; let page=1,total=1;
  while (orders.length < total) {
    const result=await request<{orders:ApiOrder[];total:number}>(`/orders/?from=${from}&to=${to}&page=${page++}&page_size=200`,signal);
    total=result.total; orders.push(...result.orders);
    if (!result.orders.length) break;
  }
  const outlets=orders.length ? await request<{outlet_id:string;district:string}[]>('/fleet/outlets/batch',signal,{method:'POST',body:JSON.stringify({outlet_ids:[...new Set(orders.map(o=>o.outlet_id))]})}).catch(()=>[]) : [];
  return orders.map(o=>mapOrder(o,outlets.find(outlet=>outlet.outlet_id===o.outlet_id)?.district || 'Unavailable'));
}
async function getOrder(id:string,signal?:AbortSignal) {
  const o=await request<ApiOrder>(`/orders/${encodeURIComponent(id)}`,signal);
  const outlets=await request<{outlet_id:string;district:string}[]>('/fleet/outlets/batch',signal,{method:'POST',body:JSON.stringify({outlet_ids:[o.outlet_id]})}).catch(()=>[]);
  return mapOrder(o,outlets[0]?.district || 'Unavailable');
}
async function getVehicles(signal?:AbortSignal):Promise<Vehicle[]> {
  const rows=await request<ApiVehicle[]>('/fleet/vehicles',signal);
  const local=readLocalAvailability();
  return rows.map(v=>{
    const override=v.unavailable_periods===undefined ? local[v.vehicle_id] : undefined;
    const periods=normalizePeriods(override?.unavailable_periods || v.unavailable_periods || []);
    return {id:v.vehicle_id,warehouse:v.depot,kind:v.type,refrigerated:v.temp==='reefer',...availabilityOn(override?.status || v.status,periods),
      unavailablePeriods:periods,weightCapacityKg:v.weight_cap_kg ?? null,volumeCapacityM3:v.volume_cap_m3 ?? null,weeklyFuelQuotaLitres:v.weekly_fuel_quota_l ?? null,
      trips:(v.trips || []).map(mapTrip),tripsLoaded:Array.isArray(v.trips)};
  });
}
async function getSchedule(date:string,depot:Warehouse,signal?:AbortSignal) {
  const [schedule,summary,deferrals,fuel]=await Promise.all([
    request<ApiSchedule>(`/planning/depots/${depot}/schedule?date=${date}`,signal),
    request<{depots:DepotSummary[]}>(`/planning/schedule/summary?date=${date}`,signal),
    request<{orders:Deferral[]}>(`/planning/schedule/deferrals?date=${date}&depot=${depot}`,signal),
    request<{utilization:number|null}>(`/fleet/fuel-usage/weekly?date=${date}&depot=${depot}`,signal).then(data=>({data,error:undefined})).catch((e:Error)=>({data:null,error:e.message})),
  ]);
  return { date,vehicles:mapSchedule(schedule),summaries:summary.depots,fuel:fuel.data?.utilization ?? null,fuelError:fuel.error,
    sample:schedule.planRunId==='stub',deferred:deferrals.orders.map((o):Order=>({ id:o.orderRef,outletId:o.outletId,date,warehouse:o.depot,destination:o.district,
      category:categoryOf(o.brand,o.temperature),status:'Deferred',reason:o.reasonDetail,items:[],itemsLoaded:false })) };
}
interface ApiIncident extends Omit<Incident,'minutesAgo'> { createdAt:string }
function mapIncident(i:ApiIncident):Incident { return {...i,minutesAgo:Math.max(0,Math.floor((Date.now()-Date.parse(i.createdAt))/60000))}; }
export const dispatcherRepository = {
  getOrders,getOrder,getVehicles,getSchedule,
  login:(username:string,password:string,signal?:AbortSignal)=>request('/auth/login',signal,{method:'POST',body:JSON.stringify({username,password}),fileFallback:false}),
  updateAvailability:(id:string,update:AvailabilityUpdate,signal?:AbortSignal)=>request<AvailabilityUpdate>(`/fleet/vehicles/${encodeURIComponent(id)}/availability`,signal,{method:'PUT',body:JSON.stringify({...update,unavailable_periods:normalizePeriods(update.unavailable_periods)})}),
  getVehicleFuel:async(id:string,date:string,depot:Warehouse,signal?:AbortSignal)=>{
    const result=await request<{vehicles?:{vehicle_id:string;quota_litres:number;consumed_litres:number}[]}>(`/fleet/fuel-usage/weekly?date=${date}&depot=${depot}`,signal);
    const vehicle=result.vehicles?.find(v=>v.vehicle_id===id);
    return {quota:vehicle?.quota_litres ?? null,consumed:vehicle?.consumed_litres ?? null,remaining:vehicle ? Math.max(0,vehicle.quota_litres-vehicle.consumed_litres) : null};
  },
  getOverview:(date:string,signal?:AbortSignal)=>request<Overview>(`/orders/dispatcher/overview?date=${date}`,signal),
  getWindows:(from:string,to:string,signal?:AbortSignal)=>request<Windows>(`/orders/dispatcher/windows?from=${from}&to=${to}`,signal),
  getStatistics:(date:string,signal?:AbortSignal)=>request<Statistics>(`/analytics/dispatcher/statistics?date=${date}`,signal),
  getForecast:(date:string,signal?:AbortSignal)=>request<Forecast>(`/analytics/forecast/demand?date=${date}`,signal),
  getIncidents:async(signal?:AbortSignal)=>(await request<ApiIncident[]>('/execution/incidents',signal)).map(mapIncident),
  getIncident:async(id:string,signal?:AbortSignal)=>mapIncident(await request<ApiIncident>(`/execution/incidents/${encodeURIComponent(id)}`,signal)),
};
