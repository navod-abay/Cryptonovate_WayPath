import React, { useRef } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { COLORS, SPACING, scale, FONT_FAMILY } from '../utils/constants';

interface OTPInputProps {
  code: string[];
  setCode: (code: string[]) => void;
  length?: number;
}

export default function OTPInput({ code, setCode, length = 4 }: OTPInputProps) {
  // Explicitly type the ref to hold an array of TextInput references or nulls
  const inputs = useRef<Array<TextInput | null>>([]);

  const handleChangeText = (text: string, index: number) => {
    const newCode = [...code];
    newCode[index] = text;
    setCode(newCode);

    // Automatically focus the next input field if a number is typed
    if (text && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      {Array(length).fill(0).map((_, index) => (
        <TextInput
          key={index}
          style={styles.box}
          keyboardType="numeric"
          maxLength={1}
          value={code[index]}
          onChangeText={(text) => handleChangeText(text, index)}
          ref={(ref) => (inputs.current[index] = ref)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm, // Already scaled in constants.ts
    marginVertical: SPACING.sm, // Already scaled in constants.ts
  },
  box: {
    width: scale(43),      // Now dynamically scales based on screen width
    height: scale(60),     // Now dynamically scales based on screen width
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    textAlign: 'center',
    fontSize: scale(24),   // Font size will scale proportionally
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.textMain,
    backgroundColor: COLORS.surface,
  },
});