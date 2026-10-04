import './Timeline.css';

export interface Step { label: string; time?: string }

/** Numbered order-progress steps; `current` is highlighted, later ones greyed out. */
export default function Timeline({ steps, current, alert }: { steps: Step[]; current: number; alert?: boolean }) {
  return (
    <ol className="sm-timeline">
      {steps.map((s, i) => (
        <li
          key={s.label}
          className={`sm-timeline__step${i <= current ? ' is-done' : ''}${i === current ? ' is-current' : ''}${i === current && alert ? ' is-alert' : ''}`}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="sm-timeline__dot">{i + 1}</span>
          <span>
            <span className="sm-timeline__label">{s.label}</span>
            <span className="sm-timeline__time">{s.time ?? '-'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
