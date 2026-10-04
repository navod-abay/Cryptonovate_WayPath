import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Warning, X } from '@phosphor-icons/react';
import { PrimaryButton } from '@waypoint/ui';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import KeyValueList from '@/components/KeyValueList';
import QuantityStepper from '@/components/QuantityStepper';
import ProductSearch from '@/components/ProductSearch';
import DatePopover from '@/components/DatePopover';
import CapacityMeter from '@/components/CapacityMeter';
import { useAppStore } from '@/state/store';
import { useNow } from '@/hooks/useNow';
import { dismissMissingItem, placeOrder } from '@/api/storeManagerApi';
import { showError } from '@/state/toasts';
import type { OrderLine, OrderType, Product } from '@/types';
import { formatDayMonth, fromISODate, nextOpenDeliveryDate, orderCutoff, pad2, splitDuration, toISODate } from '@/utils/date';
import { bindingLimit, formatKg, formatM3, loadOf, unitsThatFit } from '@/utils/load';
import { unitName } from '@/utils/text';
import { CATEGORY } from '@/config/categories';
import './PlaceOrderPage.css';

interface Row {
  key: string;
  productId: string | null;
  name: string;
  quantity: number;
  carriedOver: number;
}

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

const TRUCK_NAME: Record<OrderType, string> = { chilled: 'refrigerated truck', dry: 'dry goods truck', tech: 'tech goods truck', style: 'apparel truck' };

export default function PlaceOrderPage() {
  const { type: typeParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const now = useNow();
  const orders = useAppStore((s) => s.orders);
  const drafts = useAppStore((s) => s.drafts);
  const lastQty = useAppStore((s) => s.lastOrderQty);
  const missingAll = useAppStore((s) => s.missingFromLast);
  const categories = useAppStore((s) => s.outlet.categories);
  const products = useAppStore((s) => s.products);
  const capacities = useAppStore((s) => s.capacity);
  const productById = (id: string) => products.find((p) => p.id === id);

  const type: OrderType | null = categories.includes(typeParam as OrderType) ? (typeParam as OrderType) : null;
  const dateParam = params.get('date');
  const deliveryDate = useMemo(
    () => (dateParam ? fromISODate(dateParam) : nextOpenDeliveryDate(now)),
    [dateParam, type],
  );
  const iso = toISODate(deliveryDate);
  const existing = orders.find((o) => o.type === type && o.deliveryDate === iso);
  // A draft was started but never confirmed: it fills the cart, but placing it is still "Place Order".
  const prefill = existing ?? drafts.find((d) => d.type === type && d.deliveryDate === iso);

  const [rows, setRows] = useState<Row[]>([]);
  /** Missing items the manager already answered "Yes, add" to on this screen. */
  const [accepted, setAccepted] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load the existing order for this day (editing) or start empty.
  useEffect(() => {
    setRows(
      prefill
        ? prefill.lines.map((l) => ({ key: newKey(), productId: l.productId, name: l.name, quantity: l.quantity, carriedOver: l.carriedOver ?? 0 }))
        : [],
    );
    setAccepted([]);
    setNotice(null);
  }, [type, iso]);

  if (!type) return <Navigate to="/" replace />;

  // Without a capacity from the backend there is no limit to enforce.
  const cap = capacities[type] ?? { maxWeightKg: Infinity, maxVolumeM3: Infinity };
  const truck = TRUCK_NAME[type];
  const load = loadOf(
    rows.flatMap((r) => {
      const product = r.productId ? productById(r.productId) : undefined;
      return product ? [{ product, units: r.quantity + r.carriedOver }] : [];
    }),
  );
  const overCapacity = load.weightKg > cap.maxWeightKg + 1e-9 || load.volumeM3 > cap.maxVolumeM3 + 1e-9;
  const limitText = (p: Product) =>
    bindingLimit(p, load, cap) === 'weight'
      ? `The ${truck} weight limit is ${formatKg(cap.maxWeightKg)}`
      : `The ${truck} volume limit is ${formatM3(cap.maxVolumeM3)}`;

  const missing = (missingAll[type] ?? []).filter((m) => !accepted.includes(m.productId));
  const cutoff = orderCutoff(deliveryDate);
  const open = now < cutoff;
  const left = splitDuration(cutoff.getTime() - now.getTime());
  const days = Math.floor(left.h / 24);
  const countdown = days
    ? `${days}day${days > 1 ? 's' : ''} : ${left.h % 24}hr : ${pad2(left.m)}mins`
    : `${left.h}hr : ${pad2(left.m)}mins : ${pad2(left.s)}secs`;

  const totalItems = rows.reduce((n, r) => n + (r.productId ? r.quantity + r.carriedOver : 0), 0);
  const available = products.filter((p) => p.type === type && !rows.some((r) => r.productId === p.id));
  const hasSearchRow = rows.some((r) => !r.productId);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => { setRows((rs) => rs.filter((r) => r.key !== key)); setNotice(null); };
  const pick = (key: string, p: Product) => update(key, { productId: p.id, name: p.name, quantity: unitsThatFit(p, load, cap) >= 1 ? 1 : 0 });

  const addMissing = (m: OrderLine) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.productId === m.productId);
      if (i < 0) return [...rs, { key: newKey(), productId: m.productId, name: m.name, quantity: 0, carriedOver: m.quantity }];
      const next = [...rs];
      next[i] = { ...next[i], carriedOver: next[i].carriedOver + m.quantity };
      return next;
    });
    setAccepted((a) => [...a, m.productId]);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const order = await placeOrder({
        type,
        deliveryDate: iso,
        lines: rows
          .filter((r) => r.productId && r.quantity + r.carriedOver > 0)
          .map((r) => ({ productId: r.productId!, name: r.name, quantity: r.quantity, ...(r.carriedOver ? { carriedOver: r.carriedOver } : {}) })),
      });
      navigate(`/orders/${order.id}`, { state: { justPlaced: true } });
    } catch (e) {
      showError(e, 'Could not place the order.');
      setSaving(false);
    }
  };

  return (
    <main className="sm-page sm-place">
      <Card className="sm-place__main">
        <div className="sm-place__head">
          <h1><TypeIcon type={type} size={48} /> {CATEGORY[type].orderTitle}</h1>
          <DatePopover value={deliveryDate} now={now} onChange={(d) => setParams({ date: toISODate(d) })} />
        </div>

        <div className="sm-otable" role="table" aria-label="Order items">
          <div className="sm-otable__row sm-otable__row--head" role="row">
            <span role="columnheader">Item</span>
            <span role="columnheader">Last Order</span>
            <span role="columnheader">New Order</span>
            <span role="columnheader" className="sm-visually-hidden">Remove</span>
          </div>
          {rows.length === 0 && <p className="sm-otable__empty">Order list is empty</p>}
          {rows.map((r) => {
            const product = r.productId ? productById(r.productId) : undefined;
            const max = product ? r.quantity + unitsThatFit(product, load, cap) : 0;
            return (
              <div className="sm-otable__row" role="row" key={r.key}>
                <span role="cell">
                  {r.productId ? (
                    <>
                      {r.name}
                      {r.carriedOver > 0 && <span className="sm-otable__carry"> + {r.carriedOver} missed</span>}
                    </>
                  ) : (
                    <ProductSearch
                      products={available}
                      onPick={(p) => pick(r.key, p)}
                      unavailable={(p) => (unitsThatFit(p, load, cap) < 1 ? 'No space in truck' : null)}
                      autoFocus
                    />
                  )}
                </span>
                <span role="cell">{r.productId && lastQty[r.productId] !== undefined ? lastQty[r.productId] : '-'}</span>
                <span role="cell">
                  <QuantityStepper
                    value={r.quantity}
                    onChange={(v) => { update(r.key, { quantity: v }); setNotice(null); }}
                    max={max}
                    label={r.name || 'new item'}
                    editable={!!product}
                    maxReason={product ? limitText(product) : undefined}
                    onExceedMax={(typed) =>
                      product && setNotice(`Only ${max} ${unitName(r.name, max)} fit, not ${typed}. ${limitText(product)}.`)
                    }
                  />
                </span>
                <span role="cell">
                  <button type="button" className="sm-otable__remove" onClick={() => remove(r.key)} aria-label={`Remove ${r.name || 'row'}`}>
                    <X size={20} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        {notice && (
          <p className="sm-place__limit" role="status"><Warning size={20} weight="fill" /> {notice}</p>
        )}

        <button
          type="button"
          className="sm-place__add"
          disabled={!open || available.length === 0}
          onClick={() => !hasSearchRow && setRows((rs) => [...rs, { key: newKey(), productId: null, name: '', quantity: 0, carriedOver: 0 }])}
        >
          <Plus size={28} /> Add Product
        </button>

        {open && missing.length > 0 && (
          <div className="sm-place__prompts">
            {missing.map((m) => {
              const product = productById(m.productId);
              const fits = !product || unitsThatFit(product, load, cap) >= m.quantity;
              return (
                <div key={m.productId} className="sm-place__prompt">
                  <span>
                    Want to receive {pad2(m.quantity)} missing {unitName(m.name, m.quantity)} from last order?
                    {!fits && <small className="sm-place__prompt-full"> Not enough space in the {truck}.</small>}
                  </span>
                  <span className="sm-place__prompt-actions">
                    <button type="button" className="sm-link-button" disabled={!fits} onClick={() => addMissing(m)}>Yes, add</button>
                    <button type="button" className="sm-link-button" onClick={() => dismissMissingItem(type, m.productId).catch((e) => showError(e))}>No, don’t add</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card tone="soft" className="sm-place__side">
        <div className="sm-place__summary">
          <h2>Order Summary</h2>
          <hr className="sm-divider" />
          <div className="sm-place__figures">
            <KeyValueList rows={[{ key: 'items', label: 'Items', value: totalItems || '-' }]} />
            <CapacityMeter label="Total weight" used={load.weightKg} max={cap.maxWeightKg} format={formatKg} />
            <CapacityMeter label="Total volume" used={load.volumeM3} max={cap.maxVolumeM3} format={formatM3} />
            <KeyValueList rows={[{ key: 'delivery', label: 'Delivery', value: formatDayMonth(deliveryDate) }]} />
          </div>
          {open ? (
            <div className="sm-place__closes">
              <p>Order closes in</p>
              <p className="sm-place__countdown">{countdown}</p>
            </div>
          ) : (
            <div className="sm-place__closes sm-place__closes--closed">
              <p>Ordering is closed for {formatDayMonth(deliveryDate)}</p>
              <p className="sm-muted">Pick another day from the calendar.</p>
            </div>
          )}
        </div>
        <PrimaryButton
          title={existing ? 'Update Order' : 'Place Order'}
          onClick={submit}
          disabled={!open || totalItems === 0 || hasSearchRow || overCapacity}
          isLoading={saving}
          style={{ borderRadius: 16, minHeight: 84, fontSize: 22 }}
        />
      </Card>
    </main>
  );
}
