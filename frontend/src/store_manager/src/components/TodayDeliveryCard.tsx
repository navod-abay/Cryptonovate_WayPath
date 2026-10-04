import { useNavigate } from 'react-router-dom';
import { CaretDown } from '@phosphor-icons/react';
import { Badge } from '@waypoint/ui';
import TypeIcon from './TypeIcon';
import VehicleTag from './VehicleTag';
import type { Delivery } from '@/types';
import { formatHHmm } from '@/utils/date';
import { CATEGORY } from '@/config/categories';
import './TodayDeliveryCard.css';

/** Home: one card per delivery arriving today (chilled = cyan, dry = cream). */
export default function TodayDeliveryCard({ delivery }: { delivery: Delivery }) {
  const navigate = useNavigate();
  const delivered = delivery.status === 'delivered';
  return (
    <button
      type="button"
      className={`sm-today-card${delivered ? ' sm-today-card--done' : ''}`}
      style={delivered ? undefined : { background: CATEGORY[delivery.type].cardBg }}
      onClick={() => navigate(`/deliveries/today?d=${delivery.id}`)}
    >
      <span className="sm-today-card__head">
        <TypeIcon type={delivery.type} size={64} />
        <span className="sm-today-card__title">{CATEGORY[delivery.type].label}</span>
        {delivered && <Badge label="Delivered" backgroundColor="var(--sm-green-600)" />}
        {delivery.status === 'arrived' && <Badge label="Arrived" backgroundColor="var(--sm-cyan-600)" />}
        <CaretDown size={26} className="sm-today-card__caret" aria-hidden />
      </span>
      <span className="sm-today-card__foot">
        <span>
          <span className="sm-today-card__time">{formatHHmm(delivery.eta)}</span>
          <span className="sm-today-card__sub">{delivered ? 'Delivered' : delivery.status === 'on_the_way' ? 'Estimated Delivery' : 'Arrived'}</span>
        </span>
        <VehicleTag vehicle={delivery.vehicle} type={delivery.type} />
      </span>
    </button>
  );
}
