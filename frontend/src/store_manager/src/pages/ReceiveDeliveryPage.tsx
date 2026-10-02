import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Flag, X } from '@phosphor-icons/react';
import { PrimaryButton } from '@waypoint/ui';
import Card from '@/components/Card';
import VehicleTag from '@/components/VehicleTag';
import ReportIssueModal from '@/components/ReportIssueModal';
import ConfirmationCodeModal from '@/components/ConfirmationCodeModal';
import CarouselNav from '@/components/Carousel';
import { useAppStore } from '@/state/store';
import { completeDelivery, removeReport } from '@/api/storeManagerApi';
import type { DeliveryItem } from '@/types';
import { formatHHmm, ORDER_TYPE_LABEL, pad2 } from '@/utils/date';
import { describeReport, unitName } from '@/utils/text';
import './ReceiveDeliveryPage.css';

export default function ReceiveDeliveryPage() {
  const { deliveryId } = useParams();
  const navigate = useNavigate();
  const deliveries = useAppStore((s) => s.deliveries);
  const delivery = deliveries.find((d) => d.id === deliveryId);
  const [reporting, setReporting] = useState<DeliveryItem | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);

  const sameDay = delivery ? deliveries.filter((d) => d.date === delivery.date).sort((a, b) => a.eta.localeCompare(b.eta)) : [];
  const index = sameDay.findIndex((d) => d.id === deliveryId);

  const onVerified = useCallback(async () => {
    if (!deliveryId) return;
    await completeDelivery(deliveryId);
    setCodeOpen(false);
    navigate('/');
  }, [deliveryId, navigate]);

  if (!delivery) {
    return <main className="sm-page"><Card><p className="sm-section-title">Delivery not found.</p></Card></main>;
  }

  if (delivery.status === 'on_the_way') {
    return (
      <main className="sm-page">
        <Card>
          <p className="sm-section-title">{delivery.vehicle} has not arrived yet.</p>
          <p className="sm-muted" style={{ marginTop: 12 }}>
            You can confirm items once it reaches your outlet. <Link to={`/deliveries/today?d=${delivery.id}`}>Back to delivery</Link>
          </p>
        </Card>
      </main>
    );
  }

  const done = delivery.status === 'delivered';
  const total = delivery.items.reduce((n, i) => n + i.sent, 0);
  const issues = delivery.reports.length;
  const removedAtLoading = delivery.items.filter((i) => i.sent < i.ordered);
  const reportsFor = (productId: string) => delivery.reports.filter((r) => r.productId === productId).reduce((n, r) => n + r.quantity, 0);

  return (
    <main className="sm-page sm-receive">
      <Card className="sm-receive__main">
        <div className="sm-receive__top">
          <p><span className="sm-muted">Arrived at</span> <strong>{formatHHmm(delivery.eta)}</strong></p>
          <VehicleTag vehicle={delivery.vehicle} type={delivery.type} />
        </div>
        <h1 className="sm-receive__title">{done ? 'Received items' : 'Confirm what Arrived'}</h1>
        <h2 className="sm-receive__sub">{ORDER_TYPE_LABEL[delivery.type]} - {total} items</h2>

        <div className="sm-table" role="table" aria-label="Delivered items">
          <div className="sm-table__row sm-table__row--head" role="row">
            <span role="columnheader">Item</span>
            <span role="columnheader">Ordered</span>
            <span role="columnheader">Sent</span>
            <span role="columnheader">Received</span>
            <span role="columnheader">Actions</span>
          </div>
          {delivery.items.map((item) => {
            const flagged = reportsFor(item.productId);
            return (
              <div className="sm-table__row" role="row" key={item.productId}>
                <span role="cell" className="sm-table__name">{item.name}</span>
                <span role="cell">{item.ordered}</span>
                <span role="cell">{item.sent}</span>
                <span role="cell">{item.received}</span>
                <span role="cell">
                  {!done && (
                    <button
                      type="button"
                      className={`sm-table__flag${flagged ? ' is-flagged' : ''}`}
                      onClick={() => setReporting(item)}
                      aria-label={flagged ? `${flagged} reported for ${item.name}, report more` : `Report a problem with ${item.name}`}
                      title="Report damaged or missing"
                    >
                      {flagged ? flagged : <Flag size={28} />}
                    </button>
                  )}
                  {done && flagged > 0 && <span className="sm-table__flag is-flagged">{flagged}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="sm-receive__side">
        <div className="sm-receive__notes">
          <h2>Your Reports</h2>
          {issues ? (
            <ul className="sm-notes">
              {delivery.reports.map((r) => (
                <li key={r.id} className="sm-note sm-note--pink">
                  {describeReport(r)}
                  {!done && (
                    <button type="button" className="sm-note__remove" onClick={() => removeReport(delivery.id, r.id)} aria-label="Remove report">
                      <X size={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="sm-notes__empty">No issues reported by you !</div>
          )}

          {removedAtLoading.length > 0 && (
            <>
              <h2>Past Data</h2>
              <ul className="sm-notes">
                {removedAtLoading.map((i) => {
                  const n = i.ordered - i.sent;
                  return (
                    <li key={i.productId} className="sm-note sm-note--cream">
                      {pad2(n)} {unitName(i.name, n)} {n === 1 ? 'was' : 'were'} removed at loading !
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {done ? (
          <p className="sm-receive__done">Confirmed{issues ? ` with ${issues} issue${issues > 1 ? 's' : ''}` : ''}.</p>
        ) : (
          <PrimaryButton
            title={issues ? `Confirm Receipt with ${issues} Issue${issues > 1 ? 's' : ''}` : 'Confirm Receipt'}
            onClick={() => setCodeOpen(true)}
            style={{ borderRadius: 16, minHeight: 84, fontSize: 22 }}
          />
        )}
      </Card>

      <div className="sm-receive__nav">
        <CarouselNav
          count={sameDay.length}
          index={index}
          onChange={(i) => navigate(sameDay[i].status === 'on_the_way' ? `/deliveries/today?d=${sameDay[i].id}` : `/deliveries/${sameDay[i].id}/receive`)}
        />
      </div>

      <ReportIssueModal deliveryId={delivery.id} item={reporting} onClose={() => setReporting(null)} />
      <ConfirmationCodeModal deliveryId={delivery.id} open={codeOpen} onClose={() => setCodeOpen(false)} onVerified={onVerified} />
    </main>
  );
}
