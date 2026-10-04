import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { dismissToast, useToasts } from '@/state/toasts';
import './Toasts.css';

/** Bottom-right messages, mainly for failed API calls. */
export default function Toasts() {
  const toasts = useToasts();
  return (
    <div className="sm-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`sm-toast sm-toast--${t.tone}`}>
          {t.tone === 'error' ? <WarningCircle size={22} weight="fill" /> : <CheckCircle size={22} weight="fill" />}
          <span>{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
