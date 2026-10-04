import { useEffect, useState } from 'react';
import { PrimaryButton, SelectableCard, SelectableChip } from '@waypoint/ui';
import Modal from './Modal';
import QuantityStepper from './QuantityStepper';
import type { DeliveryItem, IssueKind } from '@/types';
import { reportIssue } from '@/api/storeManagerApi';
import { showError } from '@/state/toasts';
import './ReportIssueModal.css';

const DAMAGE_REASONS = ['Crushed', 'Leaking', 'Crate Opened'];

interface Props {
  deliveryId: string;
  item: DeliveryItem | null;
  onClose: () => void;
}

/** "What's Wrong ?" — report a damaged or missing item while confirming a delivery. */
export default function ReportIssueModal({ deliveryId, item, onClose }: Props) {
  const [kind, setKind] = useState<IssueKind | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setKind(null);
    setReasons([]);
    setQty(1);
  }, [item?.productId]);

  if (!item) return null;

  const toggleReason = (r: string) =>
    setReasons((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]));

  const submit = async () => {
    if (!kind) return;
    setSaving(true);
    try {
      await reportIssue(deliveryId, { productId: item.productId, kind, reasons: kind === 'damaged' ? reasons : [], quantity: qty });
      onClose();
    } catch (e) {
      showError(e, 'Could not send the report.');
    } finally {
      setSaving(false);
    }
  };

  const qtyLabel = kind === 'damaged' ? 'Damaged Quantity' : kind === 'missing' ? 'Missing Quantity' : 'Quantity';

  return (
    <Modal open title="What’s Wrong ?" onClose={onClose}>
      <div className="sm-report">
        <p className="sm-report__item">{item.name}</p>

        <div className="sm-report__kinds">
          <SelectableCard title="Damaged" icon="" isSelected={kind === 'damaged'} onPress={() => setKind('damaged')} />
          <SelectableCard title="Missing" icon="" isSelected={kind === 'missing'} onPress={() => { setKind('missing'); setReasons([]); }} />
        </div>

        {kind === 'damaged' && (
          <div className="sm-report__reasons">
            <p className="sm-report__label">Select all that apply</p>
            <div>
              {DAMAGE_REASONS.map((r) => (
                <SelectableChip key={r} title={r} isSelected={reasons.includes(r)} onPress={() => toggleReason(r)} />
              ))}
            </div>
          </div>
        )}

        <div className="sm-report__qty">
          <span className="sm-report__label">{qtyLabel}</span>
          <QuantityStepper value={qty} onChange={setQty} min={1} max={Math.max(1, item.sent)} size="lg" label={qtyLabel} />
        </div>

        <PrimaryButton
          title="Report"
          onClick={submit}
          disabled={!kind}
          isLoading={saving}
          style={{ borderRadius: 16, minHeight: 100, fontSize: 22 }}
        />
      </div>
    </Modal>
  );
}
