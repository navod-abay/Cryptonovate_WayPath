import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, PrimaryButton } from '@waypoint/ui';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import VehicleTag from '@/components/VehicleTag';
import KeyValueList from '@/components/KeyValueList';
import RouteProgress from '@/components/RouteProgress';
import CarouselNav from '@/components/Carousel';
import DeliveryProblemModal from '@/components/DeliveryProblemModal';
import { useAppStore } from '@/state/store';
import { useNow } from '@/hooks/useNow';
import { startUnloading } from '@/api/storeManagerApi';
import type { DeliveryStatus } from '@/types';
import { formatHHmm, ORDER_TYPE_LABEL, toISODate } from '@/utils/date';
import truck from '@/assets/truck.webp';
import './TodayDeliveriesPage.css';

const STATUS_BADGE: Record<DeliveryStatus, { label: string; bg: string }> = {
  on_the_way: { label: 'On the Way', bg: 'var(--sm-cyan-600)' },
  arrived: { label: 'Arrived', bg: 'var(--sm-cyan-600)' },
  unloading: { label: 'Unloading', bg: 'var(--sm-navy-500)' },
  delivered: { label: 'Delivered', bg: 'var(--sm-green-600)' },
};

export default function TodayDeliveriesPage() {
  const now = useNow(30_000);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const all = useAppStore((s) => s.deliveries);
  const [problemOpen, setProblemOpen] = useState(false);

  const todays = all.filter((d) => d.date === toISODate(now)).sort((a, b) => a.eta.localeCompare(b.eta));
  const index = Math.max(0, todays.findIndex((d) => d.id === params.get('d')));
  const delivery = todays[index];

  if (!delivery) {
    return (
      <main className="sm-page">
        <Card><p className="sm-section-title">No deliveries today.</p></Card>
      </main>
    );
  }

  const go = (i: number) => setParams({ d: todays[i].id }, { replace: true });
  const badge = STATUS_BADGE[delivery.status];
  const sent = delivery.items.reduce((n, i) => n + i.sent, 0);
  const arrived = delivery.status !== 'on_the_way';

  const primary = () => {
    if (delivery.status === 'arrived') {
      startUnloading(delivery.id).then(() => navigate(`/deliveries/${delivery.id}/receive`));
    } else {
      navigate(`/deliveries/${delivery.id}/receive`);
    }
  };
  const primaryLabel =
    delivery.status === 'delivered' ? 'View Receipt' : delivery.status === 'unloading' ? 'Continue Unloading' : 'Start Unloading';

  return (
    <main className="sm-page sm-today">
      <Card className="sm-today__main">
        <div className="sm-today__badges">
          <Badge label={badge.label} backgroundColor={badge.bg} />
          <TypeIcon type={delivery.type} size={48} />
        </div>
        <div className="sm-today__eta-row">
          <div>
            <p className="sm-today__eta">{formatHHmm(delivery.eta)}</p>
            <p className="sm-today__eta-label">{arrived ? 'Arrived' : 'Estimated Delivery'}</p>
            <p className="sm-today__window">
              Within your {delivery.window[0]}–{delivery.window[1]} window
            </p>
          </div>
          <VehicleTag vehicle={delivery.vehicle} type={delivery.type} />
        </div>
        <img className="sm-today__truck" src={truck} alt="" />
        <RouteProgress stops={delivery.stops} arrived={arrived} />
      </Card>

      <Card className="sm-today__side">
        <div>
          <h2 className="sm-today__type">{ORDER_TYPE_LABEL[delivery.type]}</h2>
          <hr className="sm-divider" />
          <p className="sm-today__count">{sent} items arriving</p>
          <KeyValueList rows={delivery.items.map((i) => ({ key: i.productId, label: i.name, value: i.sent }))} />
        </div>
        <div className="sm-today__actions">
          {delivery.status !== 'delivered' && (
            <PrimaryButton
              title="Report"
              variant="outline"
              onClick={() => setProblemOpen(true)}
              style={{ borderColor: 'var(--sm-maroon-500)', color: 'var(--sm-maroon-500)', borderRadius: 16, minHeight: 84, fontSize: 22, fontWeight: 500, borderWidth: 2 }}
            />
          )}
          <PrimaryButton
            title={primaryLabel}
            onClick={primary}
            disabled={!arrived}
            style={{ borderRadius: 16, minHeight: 84, fontSize: 22 }}
          />
        </div>
      </Card>

      <div className="sm-today__nav">
        <CarouselNav count={todays.length} index={index} onChange={go} />
      </div>

      <DeliveryProblemModal deliveryId={delivery.id} open={problemOpen} onClose={() => setProblemOpen(false)} />
    </main>
  );
}
