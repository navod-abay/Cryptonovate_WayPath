import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  width?: number;
  height?: number;
  color?: string;
}

export default function CarrotIcon({ width = 24, height = 24, color = 'currentColor' }: Props) {
  return (
    <Svg 
      viewBox="0 0 24 24" 
      width={width} 
      height={height} 
      fill="none" 
      stroke={color} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <Path d="M2.27 21.73a2.5 2.5 0 0 0 3.54 0l12.75-12.75a3.81 3.81 0 0 0-5.38-5.38L4.43 16.35a2.5 2.5 0 0 0-2.16 5.38z" />
      <Path d="M19.5 4.5L22 2" />
      <Path d="M16 3L18 1" />
      <Path d="M21 8L23 6" />
      <Path d="M9.5 10.5L13.5 14.5" />
      <Path d="M6.5 13.5L10.5 17.5" />
    </Svg>
  );
}