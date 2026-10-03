import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING, scale } from '../utils/constants';

interface BadgeProps {
  label?: string;
  backgroundColor?: string;
  textColor?: string;
  icon?: React.ReactNode;
}

export default function Badge({ 
  label, 
  backgroundColor = COLORS.badgeCyan, 
  textColor = COLORS.surface,
  icon 
}: BadgeProps) {
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {label && <Text style={[styles.text, { color: textColor }]}>{label}</Text>}
      {icon && icon}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: scale(4),
    borderRadius: scale(6),
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  text: {
    fontSize: scale(10),
    fontWeight: FONT_WEIGHT.bold,
    textTransform: 'uppercase',
  }
});