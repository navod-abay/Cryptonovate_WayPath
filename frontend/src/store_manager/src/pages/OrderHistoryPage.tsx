import { useNavigate } from 'react-router-dom';
import { Badge } from '@waypoint/ui';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import { useAppStore } from '@/state/store';
import type { OrderStatus } from '@/types';
import { formatDayMonth, fromISODate, ORDER_TYPE_LABEL } from '@/utils/date';
import './ListPages.css';

export const ORDER_STATUS_BADGE: Record<OrderStatus, { label: string; bg: string; fg?: string }> = {
  confirmed: { label: 'Placed', bg: 'var(--sm-amber-200)', fg: 'var(--sm-gray-900)' },
  scheduled: { label: 'Scheduled', bg: 'var(--sm-cyan-600)' },
  deferred: { label: 'Deferred', bg: 'var(--sm-maroon-500)' },
  loaded: { label: 'Loaded', bg: 'var(--sm-navy-500)' },
  on_the_way: { label: 'On the way', bg: 'var(--sm-cyan-600)' },
  delivered: { label: 'Delivered', bg: 'var(--sm-green-600)' },
};

export default function OrderHistoryPage() {
  const navigate = useNavigate();
  const orders = useAppStore((s) => s.orders);
  const sorted = [...orders].sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate) || a.type.localeCompare(b.type));

  return (
    <main className="sm-page">
      <Card className="sm-list">
        <h1 className="sm-list__title">Orders</h1>
        <div className="sm-list__row sm-list__row--head">
          <span>Delivery</span><span>Type</span><span>Items</span><span>Status</span>
        </div>
        {sorted.map((o) => {
          const b = ORDER_STATUS_BADGE[o.status];
          return (
            <button key={o.id} type="button" className="sm-list__row" onClick={() => navigate(`/orders/${o.id}`)}>
              <span>{formatDayMonth(fromISODate(o.deliveryDate))}</span>
              <span className="sm-list__type"><TypeIcon type={o.type} size={36} /> {ORDER_TYPE_LABEL[o.type]}</span>
              <span>{o.lines.reduce((n, l) => n + l.quantity + (l.carriedOver ?? 0), 0)}</span>
              <span><Badge label={b.label} backgroundColor={b.bg} textColor={b.fg} /></span>
            </button>
          );
        })}
      </Card>
    </main>
  );
}
