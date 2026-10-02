import { useState } from 'react';
import { PrimaryButton, SelectableChip } from '@waypoint/ui';
import Modal from './Modal';
import { reportDeliveryProblem } from '@/api/storeManagerApi';

const PROBLEMS = ['Vehicle is late', 'Outside my delivery window', 'Can’t reach the driver', 'Wrong vehicle'];

/** Report a problem with a delivery that has not been unloaded yet. */
export default function DeliveryProblemModal({ deliveryId, open, onClose }: { deliveryId: string; open: boolean; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const close = () => { setPicked([]); setSent(false); onClose(); };
  const submit = async () => {
    setSaving(true);
    await reportDeliveryProblem(deliveryId, picked);
    setSaving(false);
    setSent(true);
  };

  return (
    <Modal open={open} title="Report a problem" onClose={close}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingTop: 24 }}>
        {sent ? (
          <p style={{ fontSize: 22 }}>Sent to the dispatcher. You’ll see their reply in Recent Updates.</p>
        ) : (
          <>
            <p style={{ fontSize: 22, color: 'var(--sm-gray-500)' }}>Select all that apply</p>
            <div>
              {PROBLEMS.map((p) => (
                <SelectableChip
                  key={p}
                  title={p}
                  isSelected={picked.includes(p)}
                  onPress={() => setPicked((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}
                />
              ))}
            </div>
            <PrimaryButton title="Report" onClick={submit} disabled={!picked.length} isLoading={saving} style={{ borderRadius: 16, minHeight: 84, fontSize: 22 }} />
          </>
        )}
      </div>
    </Modal>
  );
}
