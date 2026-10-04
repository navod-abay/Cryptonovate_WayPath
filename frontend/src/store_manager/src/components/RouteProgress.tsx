import { Check, MapPin } from '@phosphor-icons/react';
import type { RouteStop } from '@/types';
import './RouteProgress.css';

/** Warehouse ✓ ---- Outlet 1 ✓ ---- You : where the vehicle is on its run. */
export default function RouteProgress({ stops, arrived }: { stops: RouteStop[]; arrived: boolean }) {
  return (
    <ol className="sm-route" aria-label="Delivery progress">
      {stops.map((s, i) => (
        <li key={s.label} className="sm-route__step">
          <span className={`sm-route__pill${s.done ? ' is-done' : ''}`}>
            {s.done ? (
              <span className="sm-route__check"><Check size={24} weight="bold" /></span>
            ) : (
              <span className="sm-route__num">{i + 1}</span>
            )}
            {s.label}
          </span>
          <span className="sm-route__line" aria-hidden />
        </li>
      ))}
      <li className="sm-route__step sm-route__step--last">
        <span className={`sm-route__pill sm-route__pill--you${arrived ? ' is-here' : ''}`}>
          You <MapPin size={26} />
        </span>
      </li>
    </ol>
  );
}
