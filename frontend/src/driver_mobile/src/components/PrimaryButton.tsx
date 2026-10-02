import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  ViewStyle, 
  StyleProp,
  View
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../utils/constants';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'solid' | 'outline' | 'cyan';
  disabled?: boolean;
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
  iconLeft?: React.ReactNode;  // New prop for left icons
  iconRight?: React.ReactNode; // New prop for right icons
}

export default function PrimaryButton({ 
  title, 
  onPress, 
  variant = 'solid', 
  disabled = false,
  isLoading = false,
  style,
  iconLeft,
  iconRight
}: PrimaryButtonProps) {
  const isOutline = variant === 'outline';
  const isCyan = variant === 'cyan';
  const isDisabled = disabled || isLoading;

  return (
    <TouchableOpacity 
      style={[
        styles.button, 
        isOutline && styles.outlineButton,
        isCyan && styles.cyanButton,
        isDisabled && styles.disabledButton,
        style
      ]} 
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
    >
      {isLoading ? (
        <ActivityIndicator color={isDisabled ? COLORS.textSecondary : COLORS.surface} />
      ) : (
        <>
          {/* Render left icon if provided */}
          {iconLeft && <View style={styles.iconLeft}>{iconLeft}</View>}
          
          <Text style={[
            styles.text, 
            isOutline && styles.outlineText,
            isCyan && styles.cyanText,
            isDisabled && styles.disabledText
          ]}>
            {title}
          </Text>
          
          {/* Render right icon if provided */}
          {iconRight && <View style={styles.iconRight}>{iconRight}</View>}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.primaryDark,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row', // Aligns text and icons horizontally
    width: '100%',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primaryDark,
  },
  cyanButton: {
    backgroundColor: COLORS.primaryLight,
  },
  disabledButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  text: {
    color: COLORS.surface,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  outlineText: {
    color: COLORS.primaryDark,
  },
  cyanText: {
    color: COLORS.primaryDark,
  },
  disabledText: {
    color: COLORS.textSecondary,
  },
  iconLeft: {
    marginRight: SPACING.sm,
  },
  iconRight: {
    marginLeft: SPACING.sm,
  }
});