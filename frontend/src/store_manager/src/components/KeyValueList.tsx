import type { ReactNode } from 'react';
import './KeyValueList.css';

export interface KV { key: string; label: ReactNode; value: ReactNode }

/** Label / value rows with hairline dividers (items lists, order summary). */
export default function KeyValueList({ rows, size = 'md' }: { rows: KV[]; size?: 'md' | 'lg' }) {
  return (
    <dl className={`sm-kv sm-kv--${size}`}>
      {rows.map((r) => (
        <div className="sm-kv__row" key={r.key}>
          <dt>{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
