import { Link } from 'react-router-dom';
import { Badge, COLORS } from '@waypoint/ui';
import type { Order } from '../data/types';
import { CategoryIcon, EmptyState, formatDate } from './common';

export default function OrdersTable({ orders }: { orders: Order[] }) {
  return orders.length ? <div className="table-scroll"><table className="orders-table"><thead><tr><th>Order</th><th>Category</th><th>Warehouse / Destination</th><th>Delivery date</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{orders.map(o => <tr key={o.id}>
    <td><Link to={`/dispatcher/orders/${o.id}`}><strong>{o.id}</strong></Link></td><td><CategoryIcon category={o.category} small /></td><td>{o.warehouse}<span className="secondary">{o.destination}</span></td><td>{formatDate(o.date)}</td><td><Badge label={o.status} backgroundColor={o.status === 'Delivered' ? '#b4f8d0' : o.status === 'Deferred' ? '#ffbfcb' : '#ccf2fb'} textColor={COLORS.textMain} /></td><td><Link className="text-link" to={`/dispatcher/orders/${o.id}`}>View</Link></td>
  </tr>)}</tbody></table></div> : <EmptyState />;
}
