import { CATEGORY, CATEGORY_ICON_COLOR } from '@/config/categories';
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

/** Square tile with the category icon (snowflake, carrot, game controller, t-shirt). */
export default function TypeIcon({ type, size = 48, faded = false, title }: Props) {
  const meta = CATEGORY[type];
  const Glyph = meta.icon;
  const label = title ?? meta.label;
  return (
    <span
      className={`sm-type-icon${faded ? ' sm-type-icon--faded' : ''}`}
      style={{ width: size, height: size, background: faded ? meta.tileFaded : meta.tile, color: CATEGORY_ICON_COLOR }}
      title={label}
      role="img"
      aria-label={label}
    >
      <Glyph size={Math.round(size * 0.6)} weight="regular" />
    </span>
  );
}
