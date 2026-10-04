import { useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import './QuantityStepper.css';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'md' | 'lg';
  label: string;
  /** Let the user type a number; it is clamped to min/max. */
  editable?: boolean;
  /** Explains why + is disabled (shown as a tooltip). */
  maxReason?: string;
  /** Called when a typed number was above max and got clamped. */
  onExceedMax?: (typed: number) => void;
}

/** − value + control (order quantities, damaged/missing counts). */
export default function QuantityStepper({ value, onChange, min = 0, max = 999, size = 'md', label, editable = false, maxReason, onExceedMax }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const set = (v: number) => onChange(clamp(v));
  // While typing we show the draft; otherwise always the real value (no lag after +/−).
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const n = parseInt(draft ?? '', 10);
    const next = Number.isNaN(n) ? value : clamp(n);
    setDraft(null);
    if (next !== value) onChange(next);
    if (!Number.isNaN(n) && n > max) onExceedMax?.(n); // after onChange so the page's message isn't cleared
  };

  const atMax = value >= max;
  return (
    <div className={`sm-stepper sm-stepper--${size}`} role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={size === 'lg' ? 28 : 22} />
      </button>
      {editable ? (
        <input
          className="sm-stepper__input"
          inputMode="numeric"
          value={draft ?? String(value)}
          aria-label={`${label} quantity`}
          onFocus={(e) => { setDraft(String(value)); e.currentTarget.select(); }}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      ) : (
        <output aria-live="polite">{value}</output>
      )}
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={atMax}
        aria-label={`Increase ${label}`}
        title={atMax && maxReason ? maxReason : undefined}
      >
        <Plus size={size === 'lg' ? 28 : 22} />
      </button>
    </div>
  );
}
