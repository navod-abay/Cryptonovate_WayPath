import React from 'react';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../tokens';

type Variant = 'solid' | 'outline' | 'cyan';

interface PrimaryButtonProps {
  title: string;
  onClick: () => void;
  variant?: Variant;
  disabled?: boolean;
  isLoading?: boolean;
  /** Any element placed to the left of the label */
  iconLeft?: React.ReactNode;
  /** Any element placed to the right of the label */
  iconRight?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /** Forwarded to the underlying <button> for accessibility */
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles: Record<Variant, React.CSSProperties> = {
  solid: {
    backgroundColor: COLORS.primaryDark,
    color: COLORS.surface,
    border: 'none',
  },
  outline: {
    backgroundColor: 'transparent',
    color: COLORS.primaryDark,
    border: `1.5px solid ${COLORS.primaryDark}`,
  },
  cyan: {
    backgroundColor: COLORS.primaryLight,
    color: COLORS.primaryDark,
    border: 'none',
  },
};

const disabledStyles: React.CSSProperties = {
  backgroundColor: COLORS.background,
  color: COLORS.textSecondary,
  border: `1px solid ${COLORS.border}`,
  cursor: 'not-allowed',
  opacity: 0.8,
};

/**
 * PrimaryButton — web port of driver_mobile/src/components/PrimaryButton.tsx
 *
 * Variants: solid (default), outline, cyan.
 * Supports loading spinner, left/right icon slots, disabled state.
 * Renamed `onPress` → `onClick` to follow web conventions.
 */
export default function PrimaryButton({
  title,
  onClick,
  variant = 'solid',
  disabled = false,
  isLoading = false,
  iconLeft,
  iconRight,
  style,
  className = '',
  type = 'button',
}: PrimaryButtonProps) {
  const isDisabled = disabled || isLoading;

  const composedStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    width: '100%',
    paddingBlock: SPACING.md,
    paddingInline: SPACING.lg,
    borderRadius: 'var(--wp-radius-md)',
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'opacity var(--wp-transition), filter var(--wp-transition)',
    ...(isDisabled ? disabledStyles : variantStyles[variant]),
    ...style,
  };

  return (
    <button
      type={type}
      className={`wp-component wp-primary-button ${className}`}
      style={composedStyle}
      onClick={onClick}
      disabled={isDisabled}
      onMouseEnter={(e) => {
        if (!isDisabled) (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(0.92)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.filter = '';
      }}
    >
      {isLoading ? (
        <span
          aria-label="Loading"
          style={{
            display: 'inline-block',
            width: '1.1em',
            height: '1.1em',
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'wp-spin 0.6s linear infinite',
          }}
        />
      ) : (
        <>
          {iconLeft && <span style={{ display: 'flex', alignItems: 'center' }}>{iconLeft}</span>}
          <span>{title}</span>
          {iconRight && <span style={{ display: 'flex', alignItems: 'center' }}>{iconRight}</span>}
        </>
      )}
    </button>
  );
}
