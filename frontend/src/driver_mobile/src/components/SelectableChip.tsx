import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, scale } from '../utils/constants';

interface Props {
  title: string;
  isSelected: boolean;
  onPress: () => void;
}

export default function SelectableChip({ title, isSelected, onPress }: Props) {
  return (
    <TouchableOpacity 
      style={[styles.chip, isSelected && styles.chipSelected]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      {isSelected && <Text style={styles.checkIcon}>✓</Text>}
      <Text style={[styles.title, isSelected && styles.titleSelected]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(4),
    paddingVertical: scale(8),
    paddingHorizontal: SPACING.md,
    marginRight: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  chipSelected: {
    backgroundColor: COLORS.badgeCyan,
    borderColor: COLORS.badgeCyan,
  },
  checkIcon: {
    color: COLORS.surface,
    fontSize: FONT_SIZE.sm,
    marginRight: scale(6),
    fontWeight: 'bold',
  },
  title: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  titleSelected: {
    color: COLORS.surface,
    fontWeight: 'bold',
  }
});