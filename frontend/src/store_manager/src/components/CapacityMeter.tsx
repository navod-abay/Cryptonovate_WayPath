import './CapacityMeter.css';

interface Props {
  label: string;
  used: number;
  max: number;
  format: (n: number) => string;
}

/** "Total weight 312 kg / 800 kg" with a fill bar that turns amber near the limit and red at it. */
export default function CapacityMeter({ label, used, max, format }: Props) {
  const limited = Number.isFinite(max);
  const pct = limited ? Math.min(100, (used / max) * 100) : 0;
  const tone = pct >= 100 ? 'full' : pct >= 90 ? 'near' : 'ok';
  return (
    <div className={`sm-cap sm-cap--${tone}`}>
      <div className="sm-cap__row">
        <span className="sm-cap__label">{label}</span>
        <span className="sm-cap__value">
          {format(used)} {limited && <span className="sm-cap__max">/ {format(max)}</span>}
        </span>
      </div>
      <div hidden={!limited} className="sm-cap__bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={used}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
