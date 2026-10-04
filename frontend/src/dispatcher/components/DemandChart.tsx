import { useState } from 'react';
import { categories, today } from '../data/presentation';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { RequestState, useApi } from '../data/useApi';
import { CategoryIcon, EmptyState } from './common';

export default function DemandChart() {
  const date=today(); const resource=useApi(signal=>data.getForecast(date,signal),[date]);
  const [day,setDay]=useState(2);
  const days=resource.data?.days || [];
  const values=categories.map(c=>days.map(d=>d.categories.find(r=>r.category===c.id)?.predictedUnits ?? null));
  const maximum=Math.max(5,...values.flat().filter((v):v is number=>v!==null));
  const step=Math.ceil(maximum/5), top=step*5;
  const x=(i:number)=>58+i*52, y=(v:number)=>400-v/top*370;
  return <div className="chart panel"><RequestState resource={resource} />{resource.data && <>
    <p className="chart-caption" title={resource.data.note}>{resource.data.method==='sample_data' ? 'Sample demand · not a trained forecast' : 'Demand estimate · ordered units'}</p>
    {!values.flat().some(v=>v!==null) ? <EmptyState text="Insufficient order history for an estimate." /> : <>
    <svg viewBox="0 0 326 435" role="img" aria-label="Next week's estimated demand based on recent order history">
      {Array.from({length:6},(_,i)=>i*step).map(v=><g key={v}><line x1="32" x2="305" y1={y(v)} y2={y(v)} stroke="#e7edf0" /><text x="26" y={y(v)+5} textAnchor="end">{v}</text></g>)}
      {values.map((vs,i)=><path key={categories[i].id} d={vs.map((v,j)=>v===null ? '' : `${j===0 || vs[j-1]===null ? 'M' : 'L'}${x(j)} ${y(v)}`).join(' ')} fill="none" stroke={categories[i].line} strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />)}
      <line x1={x(day)} x2={x(day)} y1="10" y2="400" stroke="#b4cddf" strokeDasharray="5 5" />
      {days.map((d,i)=><text key={d.date} x={x(i)} y="423" textAnchor="middle">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'})}</text>)}
    </svg><div className="chart-tooltip" style={{left:`${Math.min(72,22+day*15)}%`}} aria-live="polite">{categories.map((c,i)=><div key={c.id}><CategoryIcon category={c.id} small /><span>{values[i][day] ?? '—'}</span></div>)}</div><div className="chart-targets">{days.map((d,i)=><button key={d.date} aria-label={`Show ${d.date} demand`} aria-pressed={day===i} onFocus={()=>setDay(i)} onMouseEnter={()=>setDay(i)} onClick={()=>setDay(i)} />)}</div></>}
  </>}</div>;
}
