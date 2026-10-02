import { ChevronDown } from 'lucide-react';
import type { Order } from '../data/types';
import { CategoryIcon } from './common';

export default function OrderAccordion({ order, expanded, onToggle }: { order: Order; expanded: boolean; onToggle: () => void }) {
  return <div className="order-accordion">
    <button className="unallocated-row" aria-expanded={expanded} aria-controls={`items-${order.id}`} onClick={onToggle}>
      <CategoryIcon category={order.category} small /><span><strong>{order.id}</strong><span className="secondary">{order.reason}</span></span><ChevronDown className={expanded ? 'rotated' : ''} size={25} />
    </button>
    {expanded && <dl id={`items-${order.id}`} className="item-list">{order.items.map(item => <div key={item.id}><dt>{item.name}</dt><dd>{item.expected}</dd></div>)}</dl>}
  </div>;
}
