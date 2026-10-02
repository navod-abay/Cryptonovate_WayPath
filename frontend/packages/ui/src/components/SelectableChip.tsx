import React from 'react';
import { COLORS, FONT_SIZE, SPACING } from '../tokens';

interface SelectableChipProps {
  title: string;
  isSelected: boolean;
  onPress: () => void;
  className?: string;
}

/**
 * SelectableChip — web port of driver_mobile/src/components/SelectableChip.tsx
 *
 * Inline toggleable tag. Shows a checkmark when selected.
 */
export default function SelectableChip({
  title,
  isSelected,
  onPress,
  className = '',
}: SelectableChipProps) {
  return (
    <button
      type="button"
      className={`wp-component wp-selectable-chip ${isSelected ? 'wp-selectable-chip--selected' : ''} ${className}`}
      onClick={onPress}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        paddingBlock: '8px',
        paddingInline: SPACING.md,
        marginRight: SPACING.sm,
        marginBottom: SPACING.sm,
        borderRadius: 'var(--wp-radius-sm)',
        border: `1px solid ${isSelected ? COLORS.badgeCyan : COLORS.border}`,
        backgroundColor: isSelected ? COLORS.badgeCyan : COLORS.surface,
        cursor: 'pointer',
        transition: 'background-color var(--wp-transition), border-color var(--wp-transition)',
        userSelect: 'none',
      }}
    >
      {isSelected && (
        <span
          style={{
            color: COLORS.surface,
            fontSize: FONT_SIZE.sm,
            fontWeight: 'bold',
            lineHeight: 1,
          }}
        >
          ✓
        </span>
      )}
      <span
        style={{
          fontSize: FONT_SIZE.sm,
          color: isSelected ? COLORS.surface : COLORS.textSecondary,
          fontWeight: isSelected ? 'bold' : 'normal',
        }}
      >
        {title}
      </span>
    </button>
  );
}
