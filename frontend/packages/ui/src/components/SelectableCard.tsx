import React from 'react';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../tokens';

interface SelectableCardProps {
  title: string;
  /** Emoji or text icon displayed above the title */
  icon: string;
  isSelected: boolean;
  onPress: () => void;
  className?: string;
}

/**
 * SelectableCard — web port of driver_mobile/src/components/SelectableCard.tsx
 *
 * A pressable card used in selection grids (e.g., vehicle type picker).
 * Highlights with badgeCyan background when selected.
 */
export default function SelectableCard({
  title,
  icon,
  isSelected,
  onPress,
  className = '',
}: SelectableCardProps) {
  return (
    <button
      type="button"
      className={`wp-component wp-selectable-card ${isSelected ? 'wp-selectable-card--selected' : ''} ${className}`}
      onClick={onPress}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '48%',
        padding: `${SPACING.lg} ${SPACING.sm}`,
        marginBottom: SPACING.md,
        borderRadius: 'var(--wp-radius-md)',
        border: `1px solid ${isSelected ? COLORS.badgeCyan : COLORS.border}`,
        backgroundColor: isSelected ? COLORS.badgeCyan : COLORS.surface,
        cursor: 'pointer',
        transition: 'background-color var(--wp-transition), border-color var(--wp-transition)',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontSize: '1.5rem',
          marginBottom: SPACING.sm,
          color: isSelected ? COLORS.surface : COLORS.textMain,
          lineHeight: 1,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontSize: FONT_SIZE.sm,
          fontWeight: FONT_WEIGHT.medium,
          color: isSelected ? COLORS.surface : COLORS.textSecondary,
          textAlign: 'center',
        }}
      >
        {title}
      </span>
    </button>
  );
}
