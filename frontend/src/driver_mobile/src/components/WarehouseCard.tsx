import React from 'react';
import {View, StyleSheet} from 'react-native';
import CustomText from './CustomText';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import Badge from './Badge';
import TypeBadge from './TypeBadge';
import { GoodsType } from '../types/trip';

interface Props {
  title: string;
  badgeText: string;
  arriveTime: string;
  departTime: string;
  goodsType?: GoodsType;
}

export default function WarehouseCard({ title, badgeText, arriveTime, departTime, goodsType }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.row}>
          <Badge label={badgeText} />
          <View style={{ width: SPACING.sm }} />
          <TypeBadge type={goodsType} showText={true} /> 
        </View>
        <CustomText style={styles.warehouseTitle}>{title}</CustomText>
      </View>
      
      <View style={styles.timeRow}>
        <View>
          <CustomText style={styles.timeLabel}>Arrive</CustomText>
          <CustomText style={styles.arriveTime}>{arriveTime}</CustomText>
        </View>
        <View style={styles.divider} />
        <View>
          <CustomText style={styles.timeLabel}>Depart</CustomText>
          <CustomText style={styles.departTime}>{departTime}</CustomText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.shade,
    borderRadius: scale(16),
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.shade,
    marginBottom: SPACING.xsm,
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