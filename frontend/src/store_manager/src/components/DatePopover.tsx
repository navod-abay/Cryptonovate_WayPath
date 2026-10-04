import { useCallback, useRef, useState } from 'react';
import { CalendarCheck } from '@phosphor-icons/react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { addDays, formatDayMonth, formatLongDate, isDeliveryDay, nextDeliveryDate, orderCutoff, toISODate } from '@/utils/date';
import './DatePopover.css';

interface Props {
  value: Date;
  now: Date;
  onChange: (d: Date) => void;
}

/** "for 28 Sep, 2026 📅" — pick which delivery day this order is for. */
export default function DatePopover({ value, now, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(ref, close, open);

  const options: Date[] = [];
  let d = nextDeliveryDate(now);
  while (options.length < 6) {
    if (isDeliveryDay(d)) options.push(d);
    d = addDays(d, 1);
  }

  return (
    <div className="sm-datepop" ref={ref}>
      <button type="button" className="sm-datepop__trigger" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <span>for {formatLongDate(value)}</span>
        <CalendarCheck size={30} />
      </button>
      {open && (
        <ul className="sm-datepop__list" role="listbox" aria-label="Delivery date">
          {options.map((o) => {
            const closed = orderCutoff(o) <= now;
            const selected = toISODate(o) === toISODate(value);
            return (
              <li key={toISODate(o)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={closed}
                  className={selected ? 'is-selected' : ''}
                  onClick={() => { onChange(o); setOpen(false); }}
                >
                  {formatDayMonth(o)}
                  <small>{closed ? 'Closed' : `Closes ${formatDayMonth(addDays(o, -1))}, 4 PM`}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
