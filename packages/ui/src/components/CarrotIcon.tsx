import React from 'react';

interface CarrotIconProps {
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

/**
 * CarrotIcon — web port of driver_mobile/src/components/CarrotIcon.tsx
 *
 * Replaced react-native-svg with a plain inline SVG.
 * All path data is identical.
 */
export default function CarrotIcon({
  width = 24,
  height = 24,
  color = 'currentColor',
  className = '',
}: CarrotIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={width}
      height={height}
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2.27 21.73a2.5 2.5 0 0 0 3.54 0l12.75-12.75a3.81 3.81 0 0 0-5.38-5.38L4.43 16.35a2.5 2.5 0 0 0-2.16 5.38z" />
      <path d="M19.5 4.5L22 2" />
      <path d="M16 3L18 1" />
      <path d="M21 8L23 6" />
      <path d="M9.5 10.5L13.5 14.5" />
      <path d="M6.5 13.5L10.5 17.5" />
    </svg>
  );
}
