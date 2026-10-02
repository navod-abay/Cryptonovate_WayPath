/**
 * @waypoint/ui — Design Tokens
 *
 * Web port of driver_mobile/src/utils/constants.ts.
 * The mobile `scale()` helper is dropped in favour of rem/CSS custom properties,
 * but every colour, spacing step, font-size step, and font-weight is kept
 * identical so the two UIs stay visually in sync.
 */

export const COLORS = {
  primaryDark: '#00416C',
  primaryLight: '#55D3F3',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  textMain: '#2E3538',
  textSecondary: '#5C6970',
  success: '#16A34A',
  danger: '#FF334E',
  border: '#E5E7EB',
  shade: '#CCD9E259',

  warning: '#D97706',
  badgeCyan: '#009DC5',
  badgeYellow: '#FDE68A',
  iconYellow: '#00416C',
  tabInactive: '#D1D5DB',
} as const;

/** Spacing scale in rem (1 rem = 16 px baseline) */
export const SPACING = {
  sm: '0.5rem',    // 8 px
  md: '1rem',      // 16 px
  lg: '1.5rem',    // 24 px
  xl: '2rem',      // 32 px
  xxl: '3rem',     // 48 px
  xxxl: '4rem',    // 64 px
} as const;

export const FONT_SIZE = {
  sm: '0.875rem',  // 14 px
  md: '1rem',      // 16 px
  lg: '1.25rem',   // 20 px
  xl: '1.5rem',    // 24 px
  xxl: '1.875rem', // 30 px
} as const;

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type ColorToken = keyof typeof COLORS;
export type SpacingToken = keyof typeof SPACING;
export type FontSizeToken = keyof typeof FONT_SIZE;
export type FontWeightToken = keyof typeof FONT_WEIGHT;
