import { addDays,today } from './presentation';
import type { AvailabilityUpdate,UnavailablePeriod } from './types';

export function normalizePeriods(periods:UnavailablePeriod[]):UnavailablePeriod[] {
  const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  if(periods.some(p=>!validDate(p.from)||!validDate(p.to)||p.from>p.to))throw new Error('Choose valid dates. The end date must be on or after the start date.');
  const result:UnavailablePeriod[]=[];
  for(const period of periods.map(p=>({...p})).sort((a,b)=>a.from.localeCompare(b.from))) {
    const previous=result[result.length-1];
    if(previous && period.from<=addDays(previous.to,1))previous.to=previous.to>period.to ? previous.to : period.to;
    else result.push(period);
  }
  return result;
}
export function availabilityOn(status:string,periods:UnavailablePeriod[],date=today()) {
  const active=normalizePeriods(periods).find(p=>p.from<=date && date<=p.to);
  return {available:status==='available' && !active,unavailableUntil:active?.to};
}
const key='waypath.dispatcher.test-availability';
export function readLocalAvailability():Record<string,AvailabilityUpdate> {
  try{return JSON.parse(localStorage.getItem(key) || '{}');}catch{return {};}
}
export function writeLocalAvailability(id:string,update:AvailabilityUpdate) {
  const current=readLocalAvailability();current[id]=update;
  localStorage.setItem(key,JSON.stringify(current));
}
