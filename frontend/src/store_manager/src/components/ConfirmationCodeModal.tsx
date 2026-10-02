import { useCallback, useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import Modal from './Modal';
import type { ConfirmationCode } from '@/types';
import { useNow } from '@/hooks/useNow';
import { splitDuration, pad2 } from '@/utils/date';
import { requestConfirmationCode } from '@/api/storeManagerApi';
import './ConfirmationCodeModal.css';

interface Props {
  deliveryId: string;
  open: boolean;
  onClose: () => void;
  /** Driver typed the code into their app. */
  onVerified: () => void;
}

/** Shows the 6-digit handover code the store manager reads out to the driver. */
export default function ConfirmationCodeModal({ deliveryId, open, onClose, onVerified }: Props) {
  const [code, setCode] = useState<ConfirmationCode | null>(null);
  const [verified, setVerified] = useState(false);
  const now = useNow(500);

  const fetchCode = useCallback(async () => {
    setCode(null);
    setCode(await requestConfirmationCode(deliveryId));
  }, [deliveryId]);

  useEffect(() => {
    if (open) { setVerified(false); fetchCode(); }
  }, [open, fetchCode]);

  // Mock: pretend the driver enters the code ~8s after it is shown.
  // With the backend this becomes a poll / push from execution-sync.
  useEffect(() => {
    if (!open || !code) return;
    const t = setTimeout(() => setVerified(true), 8000);
    return () => clearTimeout(t);
  }, [open, code]);

  useEffect(() => {
    if (!verified) return;
    const t = setTimeout(onVerified, 1400);
    return () => clearTimeout(t);
  }, [verified, onVerified]);

  const left = code ? splitDuration(new Date(code.expiresAt).getTime() - now.getTime()) : null;
  const expired = left !== null && left.total === 0;

  return (
    <Modal open={open} title="Confirmation Code" onClose={onClose}>
      <div className="sm-code">
        <p className="sm-code__hint">Share the below code with the driver.</p>
        <div className={`sm-code__box${expired ? ' is-expired' : ''}`} aria-live="polite">
          {code ? code.code.split('').map((d, i) => <span key={i}>{d}</span>) : <span className="sm-muted">Generating…</span>}
        </div>
        <hr className="sm-divider" />
        {verified ? (
          <p className="sm-code__ok"><CheckCircle size={22} weight="fill" /> Driver confirmed the code. Delivery complete.</p>
        ) : expired ? (
          <p className="sm-code__foot">Code expired · <button type="button" className="sm-link-button" onClick={fetchCode}>Get a new code</button></p>
        ) : (
          <p className="sm-code__foot">Code expires in {left ? `${left.m}:${pad2(left.s)}` : '–'} mins</p>
        )}
      </div>
    </Modal>
  );
}
