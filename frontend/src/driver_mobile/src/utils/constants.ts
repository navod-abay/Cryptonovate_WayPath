import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Figma standard mobile frame base width (e.g., iPhone 13/14 or Android standard)
const guidelineBaseWidth = 390; 

// Scales width, margin, padding, and font sizes based on screen width
export const scale = (size: number) => (width / guidelineBaseWidth) * size;

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

  warning: '#D97706',      // Orange for "Estimated Arrival"
  badgeCyan: '#009DC5',    // Bright cyan for "DOCK 3" and "MALL BAY DOCK" tags
  badgeYellow: '#FDE68A',  // Light yellow background for the edit icon[cite: 5]
  iconYellow: '#00416C',   // Darker yellow for the edit icon stroke[cite: 5]
  tabInactive: '#D1D5DB',  // Gray for inactive "Trip 2" text[cite: 5]
} as const;

export const SPACING = {
  sm: scale(8),
  md: scale(16),
  lg: scale(24),
  xl: scale(32),
  xxl: scale(48),   // New larger spacing
  xxxl: scale(64),  // New largest spacing
} as const;

export const FONT_SIZE = {
  sm: scale(14),
  md: scale(16),   // Standard body text
  lg: scale(20),   // Button text (as per your design)
  xl: scale(24),   // Subheaders or OTP input text
  xxl: scale(30),  // Main header text (as per your design)
} as const;

export const FONT_WEIGHT = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;