import React from 'react';
import {Modal, View, StyleSheet, TouchableOpacity} from 'react-native';
import CustomText from './CustomText';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';

interface Props {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
}

export default function NoNetworkModal({ visible, onClose, onProceed }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <CustomText style={styles.title}>No Network !</CustomText>
            <TouchableOpacity onPress={onClose}>
              <CustomText style={styles.closeIcon}>✕</CustomText>
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <CustomText style={styles.subtitle}>
              You can still record your delivery status by providing proof of delivery.
            </CustomText>
            <TouchableOpacity style={styles.proceedButton} onPress={onProceed}>
              <CustomText style={styles.proceedText}>Want to Proceed ?</CustomText>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.md,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMain,
  },
  closeIcon: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.textSecondary,
  },
  content: {
    alignItems: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  proceedButton: {
    backgroundColor: COLORS.primaryDark,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: scale(8),
    width: '100%',
    alignItems: 'center',
  },
  proceedText: {
    color: COLORS.surface,
    fontWeight: FONT_WEIGHT.bold,
    fontSize: FONT_SIZE.md,
  },
});
