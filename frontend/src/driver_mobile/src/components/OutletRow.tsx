import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import Badge from './Badge';
import { TripNode } from '../types/trip';

interface Props {
  node: TripNode;
}

export default function OutletRow({ node }: Props) {
  return (
    <View style={styles.outletRow}>
      <Text style={styles.outletIndex}>{node.sequence}</Text>
      <View style={styles.outletDetails}>
        <View style={styles.rowSpaceBetween}>
          <Text style={styles.outletTitle}>{node.title}</Text>
          <Badge label={node.badgeText} />
        </View>
        <Text style={styles.outletLocation}>{node.location}</Text>
        <Text style={styles.timeWindow}>{node.scheduledStart} - {node.scheduledEnd}</Text>
        {node.estimatedArrival && (
          <Text style={styles.estimatedTime}>Estimated Arrival - {node.estimatedArrival}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outletRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: scale(12),
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
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