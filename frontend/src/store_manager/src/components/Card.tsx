import type { HTMLAttributes, ReactNode } from 'react';
import './Card.css';

type Tone = 'white' | 'soft' | 'chilled' | 'dry';

interface Props extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  padded?: boolean;
  children: ReactNode;
}

/** Rounded surface used for every panel in the store manager screens. */
export default function Card({ tone = 'white', padded = true, className = '', children, ...rest }: Props) {
  return (
    <div className={`sm-card sm-card--${tone}${padded ? ' sm-card--padded' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}
