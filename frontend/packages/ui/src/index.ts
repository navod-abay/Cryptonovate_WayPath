/**
 * @waypoint/ui
 *
 * Shared React component library — web port of driver_mobile components.
 *
 * Usage:
 *   import { PrimaryButton, Badge } from '@waypoint/ui';
 *   import '@waypoint/ui/styles';   // ← include once in your app root
 */

// ─── Design tokens (JS/TS) ────────────────────────────────────────────────────
export { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from './tokens';
export type { ColorToken, SpacingToken, FontSizeToken, FontWeightToken } from './tokens';

// ─── Shared types ─────────────────────────────────────────────────────────────
export type { InventoryItem, TripLog, TripNode, TripPayload } from './types/trip';

// ─── Components ───────────────────────────────────────────────────────────────
export { default as Badge } from './components/Badge';
export { default as CarrotIcon } from './components/CarrotIcon';
export { default as PrimaryButton } from './components/PrimaryButton';
export { default as SelectableCard } from './components/SelectableCard';
export { default as SelectableChip } from './components/SelectableChip';
export { default as OTPInput } from './components/OTPInput';
export { default as OutletRow } from './components/OutletRow';
export { default as WarehouseCard } from './components/WarehouseCard';
export { default as DeliveryConfirmationModal } from './components/DeliveryConfirmationModal';
export { default as ItemsListModal } from './components/ItemsListModal';
