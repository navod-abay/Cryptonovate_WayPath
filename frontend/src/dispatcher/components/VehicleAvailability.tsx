import { Badge,COLORS } from '@waypoint/ui';
import { useId, useState } from 'react';
import type { Vehicle } from '../data/types';
import { formatDate } from './common';

export default function VehicleAvailability({vehicle}:{vehicle:Vehicle}) {
  const [open,setOpen]=useState(false);const tooltipId=useId();
  const label=vehicle.available ? 'Available' : 'Unavailable';
  const detail=vehicle.available ? 'Available today' : vehicle.unavailableUntil ? `Unavailable through ${formatDate(vehicle.unavailableUntil,true)} (inclusive)` : 'Unavailable — end date not set';
  return <button type="button" className={`availability-indicator${open ? ' tooltip-open' : ''}`} title={detail} aria-label={`${label}. ${detail}`} aria-describedby={tooltipId} onClick={()=>setOpen(value=>!value)} onBlur={()=>setOpen(false)} onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}>
    <Badge label={label} backgroundColor={vehicle.available ? '#b4f8d0' : '#ffbfcb'} textColor={COLORS.textMain} />
    <span id={tooltipId} className="availability-tooltip" role="tooltip">{detail}</span>
  </button>;
}
