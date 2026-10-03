import { Link, useLocation, useParams } from 'react-router-dom';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import KeyValueList from '@/components/KeyValueList';
import Timeline from '@/components/Timeline';
import VehicleTag from '@/components/VehicleTag';
import { orderLineValue } from '@/components/NextOrdersCard';
import { useAppStore } from '@/state/store';
import type { Order, OrderStatus } from '@/types';
import { formatClock, formatDayMonth, formatHHmm, fromISODate } from '@/utils/date';
import { CATEGORY } from '@/config/categories';
import './OrderStatusPage.css';

const STEP_OF: Record<OrderStatus, number> = {
  confirmed: 0, scheduled: 1, deferred: 1, loaded: 2, on_the_way: 3, delivered: 4,
};

const TITLE: Record<OrderStatus, string> = {
  confirmed: 'Order received',
  scheduled: 'Order scheduled',
  deferred: 'Order deferred',
  loaded: 'Order loaded',
  on_the_way: 'Order on the way',
  delivered: 'Order delivered',
};

const t = (iso?: string) => (iso ? formatClock(new Date(iso)) : undefined);

export default function OrderStatusPage() {
  const { orderId } = useParams();
  const location = useLocation();
  const order = useAppStore((s) => s.orders.find((o) => o.id === orderId));
  const delivery = useAppStore((s) => s.deliveries.find((d) => d.orderId === orderId));

  if (!order) {
    return <main className="sm-page"><Card><p className="sm-section-title">Order not found.</p></Card></main>;
  }

  const justPlaced = (location.state as { justPlaced?: boolean } | null)?.justPlaced;
  const items = order.lines.reduce((n, l) => n + l.quantity + (l.carriedOver ?? 0), 0);
  const steps = [
    { label: 'Order confirmed', time: t(order.placedAt) },
    { label: order.status === 'deferred' ? 'Deferred' : 'Scheduled', time: t(order.scheduledAt) },
    { label: 'Loaded', time: t(order.loadedAt) },
    { label: 'On the way', time: t(order.dispatchedAt) },
    { label: 'Received and confirmed by you', time: t(order.receivedAt) },
  ];

  return (
    <main className="sm-page sm-status">
      <Card className="sm-status__main">
        <h1 className="sm-status__head">
          <TypeIcon type={order.type} size={48} /> {CATEGORY[order.type].orderTitle}
        </h1>
        <h2 className="sm-status__title">{justPlaced ? 'Order placed successfully !' : TITLE[order.status]}</h2>
        <Timeline steps={steps} current={STEP_OF[order.status]} alert={order.status === 'deferred'} />
      </Card>

      <Card tone="soft" className="sm-status__summary">
        <h2>Order Summary</h2>
        <hr className="sm-divider" />
        <KeyValueList
          rows={[
            { key: 'items', label: 'Items', value: items },
            { key: 'delivery', label: 'Delivery', value: formatDayMonth(fromISODate(order.deliveryDate)) },
          ]}
        />
        <h2 className="sm-status__items-title">Items List</h2>
        <hr className="sm-divider" />
        <KeyValueList rows={order.lines.map((l) => ({ key: l.productId, label: l.name, value: orderLineValue(l.quantity, l.carriedOver) }))} />
        <p className="sm-status__ref">Ref · {order.id}</p>
      </Card>

      <aside className="sm-status__side">
        <StatusAside order={order} deliveryId={delivery?.id} />
      </aside>
    </main>
  );
}

function StatusAside({ order, deliveryId }: { order: Order; deliveryId?: string }) {
  if (order.status === 'deferred') {
    return (
      <div className="sm-status__box sm-status__box--deferred">
        <p className="sm-status__box-title">Order Deferred !</p>
        <div className="sm-status__why">
          <p className="sm-status__why-title">Why ?</p>
          <p>{order.deferredReason ?? 'The dispatcher will share the reason soon.'}</p>
        </div>
      </div>
    );
  }
  if (order.status === 'delivered') {
    return (
      <div className="sm-status__box sm-status__box--done">
        <p className="sm-status__box-title">Delivered</p>
        <p className="sm-status__big">{order.receivedAt ? formatClock(new Date(order.receivedAt)) : '-'}</p>
        {deliveryId && <Link to={`/deliveries/${deliveryId}/receive`}>View receipt</Link>}
      </div>
    );
  }
  if (!order.eta) {
    return (
      <div className="sm-status__box sm-status__box--waiting">
        <p className="sm-status__box-title">Waiting for the plan</p>
        <p>Arrival time and vehicle will be shared after the order window closes at 4:00 PM.</p>
      </div>
    );
  }
  return (
    <>
      <div className="sm-status__box sm-status__box--eta">
        <p className="sm-status__box-title">Expected arrival time</p>
        <p className="sm-status__big">{formatHHmm(order.eta)}</p>
        {deliveryId && (order.status === 'on_the_way' || order.status === 'loaded') && (
          <Link to={`/deliveries/today?d=${deliveryId}`}>Track delivery</Link>
        )}
      </div>
      {order.vehicle && (
        <div className="sm-status__box sm-status__box--vehicle">
          <VehicleTag vehicle={order.vehicle} type={order.type} />
        </div>
      )}
    </>
  );
}
