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
import { confirmReceipt, queueReceipt, removeReport } from '@/api/storeManagerApi';
import { USE_MOCK } from '@/api/config';
import { showError, showToast } from '@/state/toasts';
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

  const closeCode = useCallback(() => setCodeOpen(false), []);

  // checkHandover already stored the delivered status; just close and go home.
  const onVerified = useCallback(() => {
    setCodeOpen(false);
    navigate('/');
  }, [navigate]);

  // Network outage: the driver recorded the delivery offline. The receipt goes out once their proof syncs.
  const onDriverLeft = useCallback(() => {
    if (!deliveryId) return;
    setCodeOpen(false);
    queueReceipt(deliveryId)
      .then(() => showToast('Receipt saved. It will be sent when the driver’s delivery proof reaches the server.', 'success'))
      .catch((e) => showError(e, 'Could not save the receipt.'));
  }, [deliveryId]);

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
                <span role="cell">{done ? item.received : Math.max(0, item.sent - flagged)}</span>
                <span role="cell">
                  {!done && (
                    <button
                      type="button"
                      className={`sm-table__flag${flagged ? ' is-flagged' : ''}`}
                      onClick={() => setReporting(item)}
                      aria-label={flagged ? `${flagged} reported for ${item.name}, report more` : `Report a problem with ${item.name}`}
                      title="Report damaged or missing"
                    >
                      <Flag size={28} />
                      {flagged > 0 && <span>{flagged}</span>}
                    </button>
                  )}
                  {done && flagged > 0 && (
                    <span className="sm-table__flag is-flagged"><Flag size={28} /><span>{flagged}</span></span>
                  )}
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
                    <button type="button" className="sm-note__remove" onClick={() => removeReport(delivery.id, r.id).catch((e) => showError(e, 'Could not remove the report.'))} aria-label="Remove report">
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
        ) : delivery.receiptQueued ? (
          <p className="sm-receive__done">Waiting for the driver’s delivery proof to sync. Your receipt{issues ? ` with ${issues} issue${issues > 1 ? 's' : ''}` : ''} will be sent automatically.</p>
        ) : (
          <PrimaryButton
            title={issues ? `Confirm Receipt with ${issues} Issue${issues > 1 ? 's' : ''}` : 'Confirm Receipt'}
            onClick={() => {
              if (!delivery.driverDone) { setCodeOpen(true); return; }
              confirmReceipt(delivery.id).then(() => navigate('/')).catch((e) => showError(e, 'Could not record the receipt.'));
            }}
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
      <ConfirmationCodeModal deliveryId={delivery.id} open={codeOpen} onClose={closeCode} onVerified={onVerified} onDriverLeft={USE_MOCK ? undefined : onDriverLeft} />
    </main>
  );
}
