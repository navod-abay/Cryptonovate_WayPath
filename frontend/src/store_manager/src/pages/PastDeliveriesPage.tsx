import { useNavigate } from 'react-router-dom';
import { Badge } from '@waypoint/ui';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import { useAppStore } from '@/state/store';
import { useNow } from '@/hooks/useNow';
import { formatDayMonth, formatHHmm, fromISODate, ORDER_TYPE_LABEL, toISODate } from '@/utils/date';
import './ListPages.css';

export default function PastDeliveriesPage() {
  const navigate = useNavigate();
  const now = useNow(60_000);
  const deliveries = useAppStore((s) => s.deliveries);
  const todayISO = toISODate(now);
  const past = deliveries
    .filter((d) => d.date < todayISO || d.status === 'delivered')
    .sort((a, b) => b.date.localeCompare(a.date) || b.eta.localeCompare(a.eta));

  return (
    <main className="sm-page">
      <Card className="sm-list">
        <h1 className="sm-list__title">Past Deliveries</h1>
        <div className="sm-list__row sm-list__row--head sm-list__row--5">
          <span>Date</span><span>Type</span><span>Vehicle</span><span>Arrived</span><span>Issues</span>
        </div>
        {past.length === 0 && <p className="sm-list__empty">No past deliveries yet.</p>}
        {past.map((d) => (
          <button key={d.id} type="button" className="sm-list__row sm-list__row--5" onClick={() => navigate(`/deliveries/${d.id}/receive`)}>
            <span>{formatDayMonth(fromISODate(d.date))}</span>
            <span className="sm-list__type"><TypeIcon type={d.type} size={36} /> {ORDER_TYPE_LABEL[d.type]}</span>
            <span>{d.vehicle}</span>
            <span>{formatHHmm(d.eta)}</span>
            <span>
              {d.reports.length ? (
                <Badge label={`${d.reports.length} issue${d.reports.length > 1 ? 's' : ''}`} backgroundColor="var(--sm-maroon-500)" />
              ) : (
                <Badge label="All good" backgroundColor="var(--sm-green-600)" />
              )}
            </span>
          </button>
        ))}
      </Card>
    </main>
  );
}
