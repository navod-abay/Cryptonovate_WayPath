import { useEffect,useRef,useState } from 'react';
import { CalendarDays,Plus,Trash2,X } from 'lucide-react';
import { PrimaryButton } from '@waypoint/ui';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { normalizePeriods } from '../data/availability';
import { today } from '../data/presentation';
import type { UnavailablePeriod,Vehicle } from '../data/types';

export default function AvailabilityDialog({vehicle,onClose,onSaved}:{vehicle:Vehicle;onClose:()=>void;onSaved:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null), controller=useRef<AbortController>();
  const [mode,setMode]=useState<'available'|'dates'>(vehicle.unavailablePeriods?.length || !vehicle.available ? 'dates' : 'available');
  const [periods,setPeriods]=useState<UnavailablePeriod[]>(vehicle.unavailablePeriods?.length ? vehicle.unavailablePeriods.map(p=>({...p})) : [{from:today(),to:today()}]);
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();return ()=>{controller.current?.abort();dialog.current?.close();};},[]);
  const change=(index:number,key:'from'|'to',value:string)=>{setError('');setPeriods(list=>list.map((p,i)=>i===index ? {...p,[key]:value} : p));};
  return <dialog ref={dialog} className="availability-dialog" aria-labelledby="availability-title" onCancel={event=>{event.preventDefault();if(!saving)onClose();}} onClick={event=>{if(event.target===event.currentTarget && !saving)onClose();}}>
    <form onSubmit={async event=>{
      event.preventDefault();setError('');
      try {
        if(mode==='dates' && !periods.length)throw new Error('Add at least one unavailable period.');
        const normalized=mode==='available' ? [] : normalizePeriods(periods);
        setSaving(true);controller.current=new AbortController();
        await data.updateAvailability(vehicle.id,{status:'available',unavailable_periods:normalized},controller.current.signal);
        onSaved();onClose();
      }catch(error){if(!controller.current?.signal.aborted)setError(error instanceof Error ? error.message : 'Could not update availability.');}
      finally{setSaving(false);}
    }}>
      <div className="dialog-heading"><span className="dialog-icon"><CalendarDays size={25} /></span><div><h2 id="availability-title">Change availability</h2><p className="secondary">{vehicle.id} · {vehicle.warehouse}</p></div><button type="button" className="icon-button" aria-label="Close availability dialog" disabled={saving} onClick={onClose}><X /></button></div>
      <fieldset disabled={saving} className="availability-options"><legend>Vehicle availability</legend><label><input type="radio" name="availability" checked={mode==='available'} onChange={()=>setMode('available')} /> Available — clear unavailable dates</label><label><input type="radio" name="availability" checked={mode==='dates'} onChange={()=>setMode('dates')} /> Unavailable on selected dates</label></fieldset>
      {mode==='dates' && <fieldset disabled={saving} className="availability-periods"><legend>Unavailable periods</legend><p className="secondary">Start and end dates are included.</p>{periods.map((period,index)=><div key={index} className="date-range-row"><label>From<input type="date" required aria-label={`Period ${index+1} start`} value={period.from} onChange={event=>change(index,'from',event.target.value)} /></label><label>Until<input type="date" required min={period.from || undefined} aria-label={`Period ${index+1} end`} value={period.to} onChange={event=>change(index,'to',event.target.value)} /></label><button type="button" className="icon-button" aria-label={`Remove period ${index+1}`} onClick={()=>setPeriods(list=>list.filter((_,i)=>i!==index))}><Trash2 size={19} /></button></div>)}<button className="add-period" type="button" onClick={()=>setPeriods(list=>[...list,{from:today(),to:today()}])}><Plus size={18} /> Add another period</button></fieldset>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="dialog-actions"><PrimaryButton title="Cancel" variant="outline" disabled={saving} onClick={onClose} style={{width:'auto',fontSize:17}} /><PrimaryButton title="Save availability" type="submit" isLoading={saving} onClick={()=>{}} style={{width:'auto',fontSize:17}} /></div>
    </form>
  </dialog>;
}
