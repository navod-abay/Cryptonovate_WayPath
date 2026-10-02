import React from 'react';
import { COLORS } from '../tokens';

interface BadgeProps {
  label?: string;
  backgroundColor?: string;
  textColor?: string;
  /** Any inline SVG or icon element */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Badge — web port of driver_mobile/src/components/Badge.tsx
 *
 * Renders a small coloured pill with an optional text label and/or icon.
 */
export default function Badge({
  label,
  backgroundColor = COLORS.badgeCyan,
  textColor = COLORS.surface,
  icon,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`wp-component wp-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        paddingInline: 'var(--wp-space-sm)',
        paddingBlock: '4px',
        borderRadius: 'var(--wp-radius-md)',
        backgroundColor,
        color: textColor,
        fontSize: '0.625rem',   // 10 px — matches scale(10) on standard screen
        fontWeight: 'var(--wp-font-weight-bold)',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {label && <span>{label}</span>}
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
    </span>
  );
}
