import { useCallback, useEffect, useState } from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import Modal from './Modal';
import type { ConfirmationCode } from '@/types';
import { useNow } from '@/hooks/useNow';
import { splitDuration, pad2 } from '@/utils/date';
import { checkHandover, requestConfirmationCode } from '@/api/storeManagerApi';
import { HANDOVER_POLL_MS } from '@/api/config';
import { ApiError } from '@/api/http';
import { showError } from '@/state/toasts';
import './ConfirmationCodeModal.css';

interface Props {
  deliveryId: string;
  open: boolean;
  onClose: () => void;
  /** Driver typed the code into their app. */
  onVerified: () => void;
  /** The driver left without entering the code (no network); omit to hide the option. */
  onDriverLeft?: () => void;
}

/** Shows the 6-digit handover code the store manager reads out to the driver. */
export default function ConfirmationCodeModal({ deliveryId, open, onClose, onVerified, onDriverLeft }: Props) {
  const [code, setCode] = useState<ConfirmationCode | null>(null);
  const [verified, setVerified] = useState(false);
  const now = useNow(500);

  const fetchCode = useCallback(async () => {
    setCode(null);
    try {
      setCode(await requestConfirmationCode(deliveryId));
    } catch (e) {
      showError(e, 'Could not get a confirmation code.');
      onClose();
    }
  }, [deliveryId, onClose]);

  useEffect(() => {
    if (open) { setVerified(false); fetchCode(); }
  }, [open, fetchCode]);

  // Ask the server every few seconds whether the driver has entered the code.
  useEffect(() => {
    if (!open || !code || verified) return;
    let stop = false;
    const tick = async () => {
      try {
        if (!stop && (await checkHandover(deliveryId))) setVerified(true);
      } catch (e) {
        // A refusal from the server will not fix itself; stop and say why. A network blip retries.
        if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
          stop = true;
          showError(e, 'Could not record the receipt.');
          onClose();
        }
      }
    };
    const id = setInterval(tick, HANDOVER_POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [open, code, verified, deliveryId, onClose]);

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
        {!verified && onDriverLeft && (
          <p className="sm-code__foot">
            Driver couldn’t enter it (no network)? <button type="button" className="sm-link-button" onClick={onDriverLeft}>Send my receipt later</button>
          </p>
        )}
      </div>
    </Modal>
  );
}
