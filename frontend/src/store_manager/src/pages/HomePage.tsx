import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TodayDeliveryCard from '@/components/TodayDeliveryCard';
import NextOrdersCard from '@/components/NextOrdersCard';
import UpdateItem from '@/components/UpdateItem';
import WeekPanel from '@/components/WeekPanel';
import AlertButtons from '@/components/AlertButtons';
import { useAppStore } from '@/state/store';
import { useNow } from '@/hooks/useNow';
import { markUpdatesRead } from '@/api/storeManagerApi';
import type { UpdateSource } from '@/types';
import { formatDayMonth, greeting, nextDeliveryDate, orderCutoff, relativeTime, startOfDay, toISODate } from '@/utils/date';
import './HomePage.css';

export default function HomePage() {
  const now = useNow();
  const navigate = useNavigate();
  const outlet = useAppStore((s) => s.outlet);
  const deliveries = useAppStore((s) => s.deliveries);
  const orders = useAppStore((s) => s.orders);
  const updates = useAppStore((s) => s.updates);
  const [filter, setFilter] = useState<UpdateSource | null>(null);

  const todayISO = toISODate(now);
  const today = useMemo(() => startOfDay(new Date(`${todayISO}T00:00:00`)), [todayISO]);
  const todays = deliveries.filter((d) => d.date === todayISO).sort((a, b) => a.eta.localeCompare(b.eta));
  const nextDate = nextDeliveryDate(now);
  const cutoff = orderCutoff(nextDate);

  const shown = [...updates]
    .filter((u) => !filter || u.source === filter)
    .sort((a, b) => b.at.localeCompare(a.at));

  const toggleFilter = (s: UpdateSource) => {
    setFilter((f) => (f === s ? null : s));
    markUpdatesRead(updates.filter((u) => u.source === s && !u.read).map((u) => u.id));
  };

  const dispatches = todays.length;

  return (
    <main className="sm-page sm-home">
      <div className="sm-home__greeting">
        <p className="sm-home__hello">{greeting(now)}, {outlet.managerName} !</p>
        <h1 className="sm-home__headline">
          {dispatches === 0 ? 'No dispatches today.' : `${dispatches} scheduled dispatch${dispatches > 1 ? 'es' : ''} today.`}
        </h1>
      </div>

      <div className="sm-home__today">
        {todays.length ? (
          todays.map((d) => <TodayDeliveryCard key={d.id} delivery={d} />)
        ) : (
          <p className="sm-muted">Nothing is arriving today.</p>
        )}
      </div>

      <section className="sm-home__orders" aria-labelledby="orders-for">
        <h2 id="orders-for" className="sm-home__h2">Orders for {formatDayMonth(nextDate)}</h2>
        <NextOrdersCard deliveryDate={nextDate} cutoff={cutoff} now={now} orders={orders} categories={outlet.categories} />
      </section>

      <section className="sm-home__updates" aria-labelledby="recent-updates">
        <h2 id="recent-updates" className="sm-home__h2">
          Recent Updates
          {filter && (
            <button type="button" className="sm-home__clear" onClick={() => setFilter(null)}>
              Showing {filter} · show all
            </button>
          )}
        </h2>
        <div className="sm-home__feed">
          {shown.map((u) => (
            <UpdateItem
              key={u.id}
              update={u}
              time={relativeTime(u.at, now)}
              onOpen={u.link ? () => { markUpdatesRead([u.id]); navigate(u.link!); } : undefined}
            />
          ))}
          {!shown.length && <p className="sm-muted">No updates.</p>}
        </div>
      </section>

      <aside className="sm-home__side">
        <WeekPanel today={today} />
        <AlertButtons updates={updates} active={filter} onToggle={toggleFilter} />
      </aside>
    </main>
  );
}
