import type { ReactNode } from 'react';
import './Banner.css';

type Tone = 'green' | 'pink' | 'amber' | 'cream';

/** Coloured status strip: order window open (green), closed (pink), warnings (amber). */
export default function Banner({ tone, children, className = '' }: { tone: Tone; children: ReactNode; className?: string }) {
  return <div className={`sm-banner sm-banner--${tone} ${className}`}>{children}</div>;
}
