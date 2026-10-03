import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import Card from './Card';
import TypeIcon from './TypeIcon';
import { useAppStore } from '@/state/store';
import type { Order, OrderType } from '@/types';
import { addDays, isDeliveryDay, monthShort, startOfDay, toISODate, weekdayShort } from '@/utils/date';
import './WeekPanel.css';

type Mark = { type: OrderType; faded: boolean; order?: Order };

const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const weekOfMonth = (monday: Date) => Math.ceil(monday.getDate() / 7);

/** "This Week" panel: one row per delivery day with the order types going out. */
export default function WeekPanel({ today }: { today: Date }) {
  const orders = useAppStore((s) => s.orders);
  const categories = useAppStore((s) => s.outlet.categories);
  const navigate = useNavigate();
  const [offset, setOffset] = useState(0);
  const monday = addDays(mondayOf(today), offset * 7);
  const todayISO = toISODate(today);

  const days = useMemo(() => {
    const out: { date: Date; iso: string; marks: Mark[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (!isDeliveryDay(date)) continue;
      const iso = toISODate(date);
      const marks: Mark[] = [...categories].reverse().flatMap<Mark>((type) => {
        const order = orders.find((o) => o.deliveryDate === iso && o.type === type);
        if (order) return [{ type, order, faded: order.status === 'confirmed' || order.status === 'deferred' }];
        // Past days without seeded orders: main category daily, the second one Mon/Wed/Fri.
        if (iso < todayISO && (type === categories[categories.length - 1] || [1, 3, 5].includes(date.getDay()))) return [{ type, faded: false }];
        return [];
      });
      out.push({ date, iso, marks });
    }
    return out;
  }, [monday, orders, todayISO, categories]);

  return (
    <Card tone="soft" className="sm-week">
      <div className="sm-week__head">
        <h2 className="sm-week__title">This Week</h2>
        <div className="sm-week__nav">
          <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label="Previous week"><CaretLeft size={18} /></button>
          <span>{monthShort(monday)}, Week {weekOfMonth(monday)}</span>
          <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label="Next week"><CaretRight size={18} /></button>
        </div>
      </div>
      <ol className="sm-week__days">
        {days.map((d) => (
          <li key={d.iso} className={`sm-week__day${d.iso === todayISO ? ' is-today' : ''}`}>
            <span className="sm-week__num">{d.date.getDate()}</span>
            <span className="sm-week__dow">{weekdayShort(d.date)}</span>
            <span className="sm-week__sep" aria-hidden />
            <span className="sm-week__marks">
              {d.marks.map((m) => (
                <button
                  key={m.type}
                  type="button"
                  className="sm-week__mark"
                  disabled={!m.order}
                  onClick={() => m.order && navigate(`/orders/${m.order.id}`)}
                  aria-label={`${m.type} order ${m.order ? m.order.status : ''}`}
                >
                  <TypeIcon type={m.type} size={48} faded={m.faded} />
                </button>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
