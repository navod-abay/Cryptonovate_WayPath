import React from 'react';
import {Modal, View, StyleSheet, TouchableOpacity, FlatList} from 'react-native';
import CustomText from './CustomText';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import { InventoryItem } from '../types/trip';

interface Props {
  visible: boolean;
  onClose: () => void;
  items: InventoryItem[];
}

export default function ItemsListModal({ visible, onClose, items }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <CustomText style={styles.title}>Items List</CustomText>
            <TouchableOpacity onPress={onClose}>
              <CustomText style={styles.closeIcon}>✕</CustomText>
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={items}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const isMismatch = item.actual < item.expected;
              return (
                <View style={styles.itemRow}>
                  <CustomText style={styles.itemName}>{item.name}</CustomText>
                  <View style={styles.qtyContainer}>
                    {isMismatch && <CustomText style={styles.warningIcon}>!</CustomText>}
                    <CustomText style={[styles.qtyText, isMismatch && styles.warningText]}>
                      {item.actual}/{item.expected}
                    </CustomText>
                  </View>
                </View>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '85%', backgroundColor: COLORS.surface, borderRadius: scale(12), padding: SPACING.lg, maxHeight: '60%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  closeIcon: { fontSize: FONT_SIZE.lg, color: COLORS.textSecondary },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: SPACING.sm },
  itemName: { fontSize: FONT_SIZE.sm, color: COLORS.textMain },
  qtyContainer: { flexDirection: 'row', alignItems: 'center' },
  warningIcon: { color: COLORS.danger, fontWeight: FONT_WEIGHT.bold, marginRight: scale(4) },
  qtyText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  warningText: { color: COLORS.danger },
});