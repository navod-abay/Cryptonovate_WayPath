import React from 'react';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../tokens';
import Badge from './Badge';
import type { TripNode } from '../types/trip';

interface OutletRowProps {
  node: TripNode;
  className?: string;
}

/**
 * OutletRow — web port of driver_mobile/src/components/OutletRow.tsx
 *
 * Displays a single delivery stop (outlet) in the trip list.
 * Uses CSS position:relative on the card and absolute on the location text
 * to match the mobile layout.
 */
export default function OutletRow({ node, className = '' }: OutletRowProps) {
  return (
    <div
      className={`wp-component wp-outlet-row ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 'var(--wp-radius-lg)',
        padding: SPACING.md,
        border: `1px solid ${COLORS.border}`,
        marginBottom: SPACING.md,
        position: 'relative',
      }}
    >
      {/* Sequence number */}
      <span
        style={{
          fontSize: FONT_SIZE.xl,
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.textMain,
          width: '1.875rem',
          flexShrink: 0,
        }}
      >
        {node.sequence}
      </span>

      {/* Detail block */}
      <div
        style={{
          flex: 1,
          paddingLeft: SPACING.md,
          borderLeft: `1px solid ${COLORS.border}`,
        }}
      >
        {/* Title row with badge */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '4px',
          }}
        >
          <span
            style={{
              fontSize: FONT_SIZE.md,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.textMain,
            }}
          >
            {node.title}
          </span>
          <Badge label={node.badgeText} />
        </div>

        {/* Location — top-right overlay like the mobile version */}
        <span
          style={{
            position: 'absolute',
            right: SPACING.md,
            top: `calc(${SPACING.md} + 1.375rem)`, // aligns ~22px below top padding
            fontSize: '0.625rem',
            color: COLORS.textSecondary,
          }}
        >
          {node.location}
        </span>

        {/* Time window */}
        <span
          style={{
            display: 'block',
            fontSize: FONT_SIZE.sm,
            color: COLORS.textMain,
            fontWeight: FONT_WEIGHT.medium,
            marginBottom: '4px',
          }}
        >
          {node.scheduledStart} – {node.scheduledEnd}
        </span>

        {/* Estimated arrival */}
        {node.estimatedArrival && (
          <span
            style={{
              display: 'block',
              fontSize: FONT_SIZE.sm,
              color: COLORS.warning,
              fontWeight: FONT_WEIGHT.medium,
            }}
          >
            Estimated Arrival – {node.estimatedArrival}
          </span>
        )}
      </div>
    </div>
  );
}
