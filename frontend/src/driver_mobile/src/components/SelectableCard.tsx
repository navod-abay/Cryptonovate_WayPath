import React, { ReactElement } from 'react';
import {TouchableOpacity, StyleSheet, View} from 'react-native';
import CustomText from './CustomText';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';

interface Props {
  title: string;
  icon: ReactElement;
  isSelected: boolean;
  onPress: () => void;
}

export default function SelectableCard({ title, icon, isSelected, onPress }: Props) {
  return (
    <TouchableOpacity 
      style={[styles.card, isSelected && styles.cardSelected]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ marginBottom: SPACING.sm }}>
        {React.cloneElement(icon, { color: isSelected ? COLORS.surface : COLORS.textMain })}
      </View>
      <CustomText style={[styles.title, isSelected && styles.textSelected]}>{title}</CustomText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%', // Leaves a small gap in a flex row
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  cardSelected: {
    backgroundColor: COLORS.badgeCyan,
    borderColor: COLORS.badgeCyan,
  },
  icon: {
    fontSize: scale(24),
    color: COLORS.textMain,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: FONT_WEIGHT.medium,
  },
  textSelected: {
    color: COLORS.surface,
  }
});