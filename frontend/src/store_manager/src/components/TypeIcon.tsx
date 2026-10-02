import { Carrot, Snowflake } from '@phosphor-icons/react';
import type { OrderType } from '@/types';
import './TypeIcon.css';

interface Props {
  type: OrderType;
  /** Tile edge in px (design uses 48 and 64). */
  size?: number;
  /** Lighter tile, e.g. an order that is not confirmed yet. */
  faded?: boolean;
  title?: string;
}

/** Square tile with the chilled (snowflake) or dry-groceries (carrot) icon. */
export default function TypeIcon({ type, size = 48, faded = false, title }: Props) {
  const glyph = Math.round(size * 0.55);
  return (
    <span
      className={`sm-type-icon sm-type-icon--${type}${faded ? ' sm-type-icon--faded' : ''}`}
      style={{ width: size, height: size }}
      title={title ?? (type === 'chilled' ? 'Chilled' : 'Dry groceries')}
      role="img"
      aria-label={title ?? (type === 'chilled' ? 'Chilled' : 'Dry groceries')}
    >
      {type === 'chilled' ? (
        <Snowflake size={glyph} weight="regular" />
      ) : (
        <Carrot size={glyph} weight="regular" />
      )}
    </span>
  );
}
