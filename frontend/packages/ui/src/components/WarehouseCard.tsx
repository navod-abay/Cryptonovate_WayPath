import React from 'react';
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from '../tokens';
import Badge from './Badge';
import CarrotIcon from './CarrotIcon';

interface WarehouseCardProps {
  title: string;
  badgeText: string;
  arriveTime: string;
  departTime: string;
  className?: string;
}

/**
 * WarehouseCard — web port of driver_mobile/src/components/WarehouseCard.tsx
 *
 * Shows warehouse title with two badge tags, plus an arrive/depart time pair.
 */
export default function WarehouseCard({
  title,
  badgeText,
  arriveTime,
  departTime,
  className = '',
}: WarehouseCardProps) {
  return (
    <div
      className={`wp-component wp-warehouse-card ${className}`}
      style={{
        backgroundColor: COLORS.shade,
        borderRadius: 'var(--wp-radius-lg)',
        padding: SPACING.md,
        border: `1px solid ${COLORS.shade}`,
        marginBottom: SPACING.lg,
      }}
    >
      {/* Card header */}
      <div style={{ marginBottom: SPACING.md }}>
        {/* Badge row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: SPACING.sm,
            marginBottom: SPACING.sm,
          }}
        >
          <Badge label={badgeText} />
          <Badge
            backgroundColor={COLORS.badgeYellow}
            icon={
              <CarrotIcon width={14} height={14} color={COLORS.iconYellow} />
            }
          />
        </div>

        {/* Warehouse title */}
        <span
          style={{
            display: 'block',
            fontSize: FONT_SIZE.lg,
            fontWeight: FONT_WEIGHT.bold,
            color: COLORS.textMain,
          }}
        >
          {title}
        </span>
      </div>

      {/* Time row */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* Arrive */}
        <div>
          <span
            style={{
              display: 'block',
              fontSize: FONT_SIZE.sm,
              color: COLORS.textSecondary,
              marginBottom: '4px',
            }}
          >
            Arrive
          </span>
          <span
            style={{
              display: 'block',
              fontSize: FONT_SIZE.lg,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.primaryDark,
            }}
          >
            {arriveTime}
          </span>
        </div>

        {/* Vertical divider */}
        <div
          style={{
            width: '1px',
            alignSelf: 'stretch',
            backgroundColor: COLORS.border,
            marginInline: SPACING.lg,
          }}
        />

        {/* Depart */}
        <div>
          <span
            style={{
              display: 'block',
              fontSize: FONT_SIZE.sm,
              color: COLORS.textSecondary,
              marginBottom: '4px',
            }}
          >
            Depart
          </span>
          <span
            style={{
              display: 'block',
              fontSize: FONT_SIZE.lg,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.danger,
            }}
          >
            {departTime}
          </span>
        </div>
      </div>
    </div>
  );
}
