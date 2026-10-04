import { addDays,today } from './presentation';
import type { ApiOrder,DepotSummary,Statistics } from './dispatcherRepository';
import type { AvailabilityUpdate,Category,Incident,Warehouse } from './types';
import { normalizePeriods,readLocalAvailability,writeLocalAvailability } from './availability';

interface FileOrder extends Omit<ApiOrder,'order_date'> { dateOffset:number;district:string }
interface FileVehicle {
  vehicle_id:string;depot:Warehouse;type:'van'|'truck';temp:string;status:string;
  weight_cap_kg:number;volume_cap_m3:number;weekly_fuel_quota_l:number;consumed_fuel_litres:number;
  unavailable_period_offsets?:{from:number;to:number}[];
  trips:{tripId:string;tripNumber:number;brand:string;district:string;weightKg:number;volumeM3:number;
    departureTime:string;returnTime:string;stops:{outletId:string;orderRef:string;temperature:string;eta:string;windowOpen:string;windowClose:string}[]}[];
}
interface FileData {
  orders:FileOrder[];vehicles:FileVehicle[];incidents:Incident[];summaries:DepotSummary[];
  overview:{category:Category;delivered:number;total:number}[];metrics:Statistics['metrics'];
  forecast:Record<Category,number[]>;fuelUtilization:number;cutoffHour:number;
}
let cached:Promise<FileData>|undefined;
let loadedAt=0;
async function readFile() {
  if(!cached)cached=fetch(`${import.meta.env.BASE_URL || '/'}data/dispatcher.json`,{signal:AbortSignal.timeout(3000)})
    .then(async response=>{
      if(!response.ok)throw new Error('Could not load the local Dispatcher test-data file.');
      loadedAt=Date.now();return await response.json() as FileData;
    }).catch(error=>{cached=undefined;throw error;});
  return cached;
}
function required<T>(record:T|undefined,label:string):T {
  if(!record)throw new Error(`${label} not found in the local test-data file.`);
  return record;
}

/** Translate the editable JSON file into the same response shapes as the frontend API adapter. */
export async function fileResponse(path:string,init:RequestInit={},signal?:AbortSignal):Promise<unknown> {
  signal?.throwIfAborted();
  const file=await readFile();signal?.throwIfAborted();
  const url=new URL(path,'http://dispatcher.local'), route=url.pathname.replace(/\/$/,'');
  const date=url.searchParams.get('date') || today();
  const overrides=readLocalAvailability();
  const vehicles=file.vehicles.map(v=>({...v,...overrides[v.vehicle_id],unavailable_periods:overrides[v.vehicle_id]?.unavailable_periods || (v.unavailable_period_offsets || []).map(p=>({from:addDays(today(),p.from),to:addDays(today(),p.to)}))}));
  const availability=route.match(/^\/fleet\/vehicles\/([^/]+)\/availability$/);
  if(availability && init.method==='PUT') {
    const update=JSON.parse(String(init.body)) as AvailabilityUpdate;
    if(!['available','in_workshop'].includes(update.status) || !Array.isArray(update.unavailable_periods))throw new Error('Invalid availability update.');
    update.unavailable_periods=normalizePeriods(update.unavailable_periods);
    writeLocalAvailability(decodeURIComponent(availability[1]),update);
    return update;
  }
  const orders=file.orders.map(o=>({...o,order_date:addDays(today(),o.dateOffset)}));
  const from=url.searchParams.get('from') || today(),to=url.searchParams.get('to') || from;
  if(route==='/orders') {
    const selected=orders.filter(o=>o.order_date>=from && o.order_date<=to);
    const page=Number(url.searchParams.get('page') || 1),size=Number(url.searchParams.get('page_size') || 200);
    return {orders:selected.slice((page-1)*size,page*size),total:selected.length,page,page_size:size};
  }
  if(route==='/orders/dispatcher/overview')return {date,categories:file.overview};
  if(route==='/orders/dispatcher/windows') {
    const days=[];
    for(let day=from;day<=to;day=addDays(day,1)) {
      if(new Date(day).getUTCDay()===0)continue;
      let previous=addDays(day,-1);while(new Date(previous).getUTCDay()===0)previous=addDays(previous,-1);
      const cutoffAt=new Date(`${previous}T${String(file.cutoffHour).padStart(2,'0')}:00:00+05:30`).toISOString();
      days.push({date:day,cutoffAt,open:Date.parse(cutoffAt)>Date.now()});
    }
    return {serverTime:new Date().toISOString(),timeZone:'Asia/Colombo',days};
  }
  if(route.startsWith('/orders/'))return required(orders.find(o=>o.order_ref===decodeURIComponent(route.slice('/orders/'.length))),'Order');
  if(route==='/fleet/outlets/batch') {
    const ids: string[]=JSON.parse(String(init.body || '{}')).outlet_ids || [];
    return file.orders.filter(o=>ids.includes(o.outlet_id)).map(o=>({outlet_id:o.outlet_id,district:o.district}));
  }
  if(route==='/fleet/vehicles')return vehicles;
  if(route==='/fleet/fuel-usage/weekly') {
    const selected=vehicles.filter(v=>!url.searchParams.get('depot') || v.depot===url.searchParams.get('depot'));
    return {utilization:file.fuelUtilization,vehicles:selected.map(v=>({vehicle_id:v.vehicle_id,quota_litres:v.weekly_fuel_quota_l,consumed_litres:v.consumed_fuel_litres}))};
  }
  if(route==='/planning/schedule/summary')return {date,depots:file.summaries};
  if(route==='/planning/schedule/deferrals') {
    const depot=url.searchParams.get('depot');
    const deferred=orders.filter(o=>o.status==='deferred' && o.order_date===date && (!depot || o.depot===depot));
    return {date,orders:deferred.map(o=>({orderRef:o.order_ref,outletId:o.outlet_id,depot:o.depot,district:o.district,brand:o.brand,temperature:o.temp_requirement,reasonDetail:o.events?.[0]?.reason_note || 'Deferred'}))};
  }
  const schedule=route.match(/^\/planning\/depots\/([^/]+)\/schedule$/);
  if(schedule)return {date,depot:schedule[1],planRunId:'file',vehicles:file.vehicles.filter(v=>v.depot===schedule[1]).map(v=>({vehicleId:v.vehicle_id,type:v.type,temperature:v.temp,trips:v.trips}))};
  if(route==='/analytics/dispatcher/statistics')return {period:{from:addDays(date,-7),to:addDays(date,-1)},metrics:file.metrics};
  if(route==='/analytics/forecast/demand') {
    const weekday=new Date(date).getUTCDay(),monday=addDays(date,(8-weekday)%7 || 7);
    return {method:'file_test_data',unit:'ordered_units',note:'Editable sample demand from the local test-data file.',days:Array.from({length:5},(_,i)=>({date:addDays(monday,i),categories:Object.entries(file.forecast).map(([category,values])=>({category,predictedUnits:values[i]}))}))};
  }
  const incidents=file.incidents.map(i=>({...i,createdAt:new Date(loadedAt-i.minutesAgo*60000).toISOString()}));
  if(route==='/execution/incidents')return incidents;
  if(route.startsWith('/execution/incidents/'))return required(incidents.find(i=>i.id===decodeURIComponent(route.slice('/execution/incidents/'.length))),'Incident');
  throw new Error(`No local test data is configured for ${route}.`);
}
