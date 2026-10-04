import { ChevronDown } from 'lucide-react';
import type { Order } from '../data/types';
import { dispatcherRepository as data } from '../data/dispatcherRepository';
import { RequestState, useApi } from '../data/useApi';
import { CategoryIcon } from './common';

function OrderItems({ order }: { order:Order }) {
  const resource=useApi(signal=>order.itemsLoaded ? Promise.resolve(order) : data.getOrder(order.id,signal),[order.id],0);
  return <><RequestState resource={resource} />{resource.data && <dl id={`items-${order.id}`} className="item-list">{resource.data.items.length ? resource.data.items.map(item=><div key={item.id}><dt>{item.name}</dt><dd>{item.expected}</dd></div>) : <p>No order items.</p>}</dl>}</>;
}
export default function OrderAccordion({ order, expanded, onToggle }: { order:Order;expanded:boolean;onToggle:()=>void }) {
  return <div className="order-accordion"><button className="unallocated-row" aria-expanded={expanded} aria-controls={`items-${order.id}`} onClick={onToggle}><CategoryIcon category={order.category} small /><span><strong>{order.outletId || order.id}</strong><span className="secondary">{order.reason}</span></span><ChevronDown className={expanded ? 'rotated' : ''} size={25} /></button>{expanded && <OrderItems order={order} />}</div>;
}
