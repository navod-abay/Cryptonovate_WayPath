import type { Category } from './types';
export const categories: { id:Category;label:string;color:string;surface:string;line:string }[] = [
  { id:'chilled',label:'Chilled',color:'#80def6',surface:'#ccf2fb',line:'#00bdeb' },
  { id:'dry',label:'Dry',color:'#ffe684',surface:'#fffbeb',line:'#ff9900' },
  { id:'tech',label:'Tech',color:'#b4f8d0',surface:'#effcf4',line:'#19ca58' },
  { id:'style',label:'Style',color:'#ffbfcb',surface:'#fff5f7',line:'#ff5d7d' },
];
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Colombo',year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date());
  const get = (type:string)=>parts.find(p=>p.type===type)!.value; return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date:string,days:number) { const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10); }
