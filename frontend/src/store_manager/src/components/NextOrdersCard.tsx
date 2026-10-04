import { useNavigate } from 'react-router-dom';
import { PencilSimple } from '@phosphor-icons/react';
import { PrimaryButton } from '@waypoint/ui';
import Card from './Card';
import Banner from './Banner';
import KeyValueList from './KeyValueList';
import type { Order, OrderType } from '@/types';
import { formatClock, formatDayMonth, splitDuration, toISODate, weekdayLong } from '@/utils/date';
import { CATEGORY } from '@/config/categories';
import './NextOrdersCard.css';

interface Props {
  deliveryDate: Date;
  cutoff: Date;
  now: Date;
  orders: Order[];
  categories: OrderType[];
}

const typeName = (t: OrderType) => CATEGORY[t].short;

export function orderLineValue(quantity: number, carriedOver?: number) {
  return carriedOver ? `${quantity} + ${carriedOver} missed` : String(quantity);
}

/** Home: status of the orders for the next delivery day (open / closed / not placed). */
export default function NextOrdersCard({ deliveryDate, cutoff, now, orders, categories }: Props) {
  const navigate = useNavigate();
  const open = now < cutoff;
  const left = splitDuration(cutoff.getTime() - now.getTime());
  const leftText = left.h ? `${left.h}hr ${left.m}mins` : `${left.m}mins ${left.s}secs`;
  const iso = toISODate(deliveryDate);

  // Types that still need an order go first: that's the action the manager must take.
  const sections = categories
    .map((type) => ({ type, order: orders.find((o) => o.type === type && o.deliveryDate === iso) }))
    .sort((a, b) => Number(!!a.order) - Number(!!b.order));

  return (
    <Card tone="soft" className="sm-next">
      {sections.map(({ type, order }) => (
        <section key={type} className="sm-next__section">
          {!order ? (
            <div className="sm-next__empty">
              <p className="sm-next__empty-msg">
                {typeName(type)} order due for {weekdayLong(deliveryDate)} is yet to be placed !
              </p>
              {open ? (
                <>
                  <Banner tone="amber">You can’t place the order after {formatClock(cutoff)}</Banner>
                  <PrimaryButton
                    title={`Place ${CATEGORY[type].buttonName} Order`}
                    onClick={() => navigate(`/orders/new/${type}?date=${iso}`)}
                    style={{ borderRadius: 16, minHeight: 84, fontSize: 22, fontWeight: 500 }}
                  />
                </>
              ) : (
                <Banner tone="pink">
                  <strong>Closed !</strong>
                  <div>No {typeName(type).toLowerCase()} order for {formatDayMonth(deliveryDate)}</div>
                </Banner>
              )}
            </div>
          ) : (
            <>
              <div className="sm-next__head">
                <h3>{CATEGORY[type].label}</h3>
                {open && (
                  <button
                    type="button"
                    className="sm-next__edit"
                    aria-label={`Edit ${typeName(type)} order`}
                    onClick={() => navigate(`/orders/new/${type}?date=${iso}`)}
                  >
                    <PencilSimple size={26} />
                  </button>
                )}
              </div>
              {open ? (
                <Banner tone="green">
                  <strong>Closes at {formatClock(cutoff)}, in {leftText}</strong>
                </Banner>
              ) : (
                <Banner tone="pink">
                  <strong>Closed !</strong>
                  <div>Delivery details will be informed soon</div>
                </Banner>
              )}
              <KeyValueList
                rows={order.lines.map((l) => ({
                  key: l.productId,
                  label: l.name,
                  value: orderLineValue(l.quantity, l.carriedOver),
                }))}
              />
            </>
          )}
        </section>
      ))}
    </Card>
  );
}
