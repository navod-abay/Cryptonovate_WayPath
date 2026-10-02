import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, X } from '@phosphor-icons/react';
import { PrimaryButton } from '@waypoint/ui';
import Card from '@/components/Card';
import TypeIcon from '@/components/TypeIcon';
import KeyValueList from '@/components/KeyValueList';
import QuantityStepper from '@/components/QuantityStepper';
import ProductSearch from '@/components/ProductSearch';
import DatePopover from '@/components/DatePopover';
import { useAppStore } from '@/state/store';
import { useNow } from '@/hooks/useNow';
import { PRODUCTS } from '@/mock/catalogue';
import { dismissMissingItems, placeOrder } from '@/api/storeManagerApi';
import type { OrderType, Product } from '@/types';
import { formatDayMonth, fromISODate, nextOpenDeliveryDate, orderCutoff, pad2, splitDuration, toISODate } from '@/utils/date';
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

export default function PlaceOrderPage() {
  const { type: typeParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const now = useNow();
  const orders = useAppStore((s) => s.orders);
  const lastQty = useAppStore((s) => s.lastOrderQty);
  const missingAll = useAppStore((s) => s.missingFromLast);

  const type: OrderType | null = typeParam === 'chilled' || typeParam === 'dry' ? typeParam : null;
  const dateParam = params.get('date');
  const deliveryDate = useMemo(
    () => (dateParam ? fromISODate(dateParam) : nextOpenDeliveryDate(now)),
    [dateParam, type],
  );
  const iso = toISODate(deliveryDate);
  const existing = orders.find((o) => o.type === type && o.deliveryDate === iso);

  const [rows, setRows] = useState<Row[]>([]);
  const [promptDone, setPromptDone] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load the existing order for this day (editing) or start empty.
  useEffect(() => {
    setRows(
      existing
        ? existing.lines.map((l) => ({ key: newKey(), productId: l.productId, name: l.name, quantity: l.quantity, carriedOver: l.carriedOver ?? 0 }))
        : [],
    );
    setPromptDone(false);
  }, [type, iso]);

  if (!type) return <Navigate to="/" replace />;

  const missing = missingAll[type];
  const showPrompt = !promptDone && missing.length > 0;
  const cutoff = orderCutoff(deliveryDate);
  const open = now < cutoff;
  const left = splitDuration(cutoff.getTime() - now.getTime());
  const days = Math.floor(left.h / 24);
  const countdown = days
    ? `${days}day${days > 1 ? 's' : ''} : ${left.h % 24}hr : ${pad2(left.m)}mins`
    : `${left.h}hr : ${pad2(left.m)}mins : ${pad2(left.s)}secs`;

  const totalItems = rows.reduce((n, r) => n + (r.productId ? r.quantity + r.carriedOver : 0), 0);
  const available = PRODUCTS.filter((p) => p.type === type && !rows.some((r) => r.productId === p.id));
  const hasSearchRow = rows.some((r) => !r.productId);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const pick = (key: string, p: Product) => update(key, { productId: p.id, name: p.name, quantity: Math.max(1, rows.find((r) => r.key === key)?.quantity ?? 0) });

  const addMissing = () => {
    setRows((rs) => {
      const next = [...rs];
      for (const m of missing) {
        const i = next.findIndex((r) => r.productId === m.productId);
        if (i >= 0) next[i] = { ...next[i], carriedOver: next[i].carriedOver + m.quantity };
        else next.push({ key: newKey(), productId: m.productId, name: m.name, quantity: 0, carriedOver: m.quantity });
      }
      return next;
    });
    setPromptDone(true);
  };

  const submit = async () => {
    setSaving(true);
    const order = await placeOrder({
      type,
      deliveryDate: iso,
      lines: rows
        .filter((r) => r.productId && r.quantity + r.carriedOver > 0)
        .map((r) => ({ productId: r.productId!, name: r.name, quantity: r.quantity, ...(r.carriedOver ? { carriedOver: r.carriedOver } : {}) })),
    });
    navigate(`/orders/${order.id}`, { state: { justPlaced: true } });
  };

  return (
    <main className="sm-page sm-place">
      <Card className="sm-place__main">
        <div className="sm-place__head">
          <h1><TypeIcon type={type} size={48} /> {type === 'chilled' ? 'Chilled order' : 'Dry groceries order'}</h1>
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
          {rows.map((r) => (
            <div className="sm-otable__row" role="row" key={r.key}>
              <span role="cell">
                {r.productId ? (
                  <>
                    {r.name}
                    {r.carriedOver > 0 && <span className="sm-otable__carry"> + {r.carriedOver} missed</span>}
                  </>
                ) : (
                  <ProductSearch products={available} onPick={(p) => pick(r.key, p)} autoFocus />
                )}
              </span>
              <span role="cell">{r.productId && lastQty[r.productId] !== undefined ? lastQty[r.productId] : '-'}</span>
              <span role="cell">
                <QuantityStepper value={r.quantity} onChange={(v) => update(r.key, { quantity: v })} label={r.name || 'new item'} />
              </span>
              <span role="cell">
                <button type="button" className="sm-otable__remove" onClick={() => remove(r.key)} aria-label={`Remove ${r.name || 'row'}`}>
                  <X size={20} />
                </button>
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="sm-place__add"
          disabled={!open || available.length === 0}
          onClick={() => !hasSearchRow && setRows((rs) => [...rs, { key: newKey(), productId: null, name: '', quantity: 0, carriedOver: 0 }])}
        >
          <Plus size={28} /> Add Product
        </button>

        {showPrompt && open && (
          <div className="sm-place__prompt">
            <span>Want to receive missing {pad2(missing.reduce((n, m) => n + m.quantity, 0))} items from last order?</span>
            <span className="sm-place__prompt-actions">
              <button type="button" className="sm-link-button" onClick={addMissing}>Yes, add</button>
              <button type="button" className="sm-link-button" onClick={() => { setPromptDone(true); dismissMissingItems(type); }}>No, don’t add</button>
            </span>
          </div>
        )}
      </Card>

      <Card tone="soft" className="sm-place__side">
        <div className="sm-place__summary">
          <h2>Order Summary</h2>
          <hr className="sm-divider" />
          <KeyValueList
            rows={[
              { key: 'items', label: 'Items', value: totalItems || '-' },
              { key: 'delivery', label: 'Delivery', value: formatDayMonth(deliveryDate) },
            ]}
          />
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
          disabled={!open || totalItems === 0 || hasSearchRow}
          isLoading={saving}
          style={{ borderRadius: 16, minHeight: 84, fontSize: 22 }}
        />
      </Card>
    </main>
  );
}
