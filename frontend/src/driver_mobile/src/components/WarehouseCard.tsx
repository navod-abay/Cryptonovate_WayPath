import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import Badge from './Badge';
import CarrotIcon from './CarrotIcon';

interface Props {
  title: string;
  badgeText: string;
  arriveTime: string;
  departTime: string;
}

export default function WarehouseCard({ title, badgeText, arriveTime, departTime }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.row}>
          <Badge label={badgeText} />
          <View style={{ width: SPACING.sm }} />
          <Badge backgroundColor={COLORS.badgeYellow} 
          icon={<CarrotIcon width={scale(14)} height={scale(14)} color={COLORS.iconYellow} />}
          /> 
        </View>
        <Text style={styles.warehouseTitle}>{title}</Text>
      </View>
      
      <View style={styles.timeRow}>
        <View>
          <Text style={styles.timeLabel}>Arrive</Text>
          <Text style={styles.arriveTime}>{arriveTime}</Text>
        </View>
        <View style={styles.divider} />
        <View>
          <Text style={styles.timeLabel}>Depart</Text>
          <Text style={styles.departTime}>{departTime}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.shade,
    borderRadius: scale(12),
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.shade,
    marginBottom: SPACING.lg,
    // elevation: 2, // Android shadow
  },
  cardHeader: { marginBottom: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  warehouseTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: scale(4) },
  arriveTime: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.primaryDark },
  departTime: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.danger },
  divider: { width: 1, height: '100%', backgroundColor: COLORS.border, marginHorizontal: SPACING.lg },
});