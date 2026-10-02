import { Minus, Plus } from '@phosphor-icons/react';
import './QuantityStepper.css';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: 'md' | 'lg';
  label: string;
}

/** − value + control (order quantities, damaged/missing counts). */
export default function QuantityStepper({ value, onChange, min = 0, max = 999, size = 'md', label }: Props) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className={`sm-stepper sm-stepper--${size}`} role="group" aria-label={label}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`Decrease ${label}`}>
        <Minus size={size === 'lg' ? 28 : 22} />
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`Increase ${label}`}>
        <Plus size={size === 'lg' ? 28 : 22} />
      </button>
    </div>
  );
}
