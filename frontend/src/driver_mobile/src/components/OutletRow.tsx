import React from 'react';
import {View, StyleSheet} from 'react-native';
import CustomText from './CustomText';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import Badge from './Badge';
import TypeBadge from './TypeBadge';
import { TripNode } from '../types/trip';

interface Props {
  node: TripNode;
}

export default function OutletRow({ node }: Props) {
  return (
    <View style={styles.outletRow}>
      <CustomText style={styles.outletIndex}>{node.sequence}</CustomText>
      <View style={styles.outletDetails}>
        <View style={styles.rowSpaceBetween}>
          <CustomText style={styles.outletTitle}>{node.title}</CustomText>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Badge label={node.badgeText} />
            {node.goodsType && (
              <>
                <View style={{ width: SPACING.sm }} />
                <TypeBadge type={node.goodsType} showText={false} />
              </>
            )}
          </View>
        </View>
        {/* <CustomText style={styles.outletLocation}>{node.location}</CustomText> */}
        <CustomText style={styles.timeWindow}>{node.scheduledStart} - {node.scheduledEnd}</CustomText>
        {node.estimatedArrival && (
          <CustomText style={styles.estimatedTime}>Estimated Arrival - {node.estimatedArrival}</CustomText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outletRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: scale(16),
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 0, // Margin is handled by the wrapper now
    alignItems: 'center',
  },
  outletIndex: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMain,
    width: scale(30),
  },
  outletDetails: {
    flex: 1,
    paddingLeft: SPACING.md,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  rowSpaceBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(4),
  },
  outletTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  outletLocation: {
    position: 'absolute',
    right: 0,
    top: scale(22),
    fontSize: scale(10),
    color: COLORS.textSecondary,
  },
  timeWindow: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMain,
    fontWeight: FONT_WEIGHT.medium,
    marginBottom: scale(4),
  },
  estimatedTime: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
    fontWeight: FONT_WEIGHT.medium,
  },
});