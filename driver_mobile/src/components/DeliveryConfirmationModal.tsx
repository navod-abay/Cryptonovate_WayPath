import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import OTPInput from './OTPInput';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (code: string) => void;
}

export default function DeliveryConfirmationModal({ visible, onClose, onConfirm }: Props) {
  // Initialize with 6 empty strings to match the 6 input boxes in the design[cite: 13]
  const [code, setCode] = useState(Array(6).fill(''));
  
  // 1 minute 52 seconds = 112 seconds total[cite: 13]
  const [timeLeft, setTimeLeft] = useState(112);

  useEffect(() => {
    // Reset timer and code when modal opens or closes
    if (!visible) {
      setTimeLeft(112);
      setCode(Array(6).fill(''));
      return;
    }

    // Stop timer at 0
    if (timeLeft <= 0) return;

    // Decrease by 1 every 1000ms (1 second)
    const timerId = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, visible]);

  // Convert seconds back into M:SS format
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleComplete = () => {
    onConfirm(code.join(''));
    setCode(Array(6).fill('')); // Reset on success
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          
          {/* Header with the bottom horizontal line[cite: 13] */}
          <View style={styles.header}>
            <Text style={styles.title}>Delivery Confirmation</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.subtitle}>
            Please enter the code displayed in the store manager's application.
          </Text>
          
          <OTPInput code={code} setCode={setCode} length={6} />
          
          {/* Footer area with the top horizontal line[cite: 13] */}
          <View style={styles.footerDivider}>
            <Text style={styles.resendText}>
              {timeLeft > 0 
                ? `Resend code in ${formatTime(timeLeft)} mins` 
                : 'Resend code now'}
            </Text>
          </View>
          
          {/* Automatically confirm if all 6 digits are entered for demo purposes */}
          {code[5] !== '' && (
            <TouchableOpacity style={styles.confirmButton} onPress={handleComplete}>
              <Text style={styles.confirmText}>Verify</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  modalContainer: { 
    width: '85%', 
    backgroundColor: COLORS.surface, 
    borderRadius: scale(12), 
    padding: SPACING.lg 
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingBottom: SPACING.md,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,           // Adds the top horizontal line[cite: 13]
    borderBottomColor: COLORS.border,
  },
  title: { 
    fontSize: FONT_SIZE.lg, 
    fontWeight: FONT_WEIGHT.bold, 
    color: COLORS.textMain 
  },
  closeIcon: { 
    fontSize: FONT_SIZE.lg, 
    color: COLORS.textSecondary 
  },
  subtitle: { 
    fontSize: FONT_SIZE.sm, 
    color: COLORS.textSecondary, 
    marginBottom: SPACING.md 
  },
  footerDivider: {
    paddingTop: SPACING.md,
    marginTop: SPACING.sm,
    borderTopWidth: 1,              // Adds the bottom horizontal line[cite: 13]
    borderTopColor: COLORS.border,
  },
  resendText: { 
    textAlign: 'center', 
    fontSize: scale(12), 
    color: COLORS.textSecondary 
  },
  confirmButton: { 
    backgroundColor: COLORS.primaryDark, 
    padding: SPACING.md, 
    borderRadius: 8, 
    marginTop: SPACING.md, 
    alignItems: 'center' 
  },
  confirmText: { 
    color: COLORS.surface, 
    fontWeight: FONT_WEIGHT.bold 
  },
});