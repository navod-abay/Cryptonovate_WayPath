# @waypoint/ui

> **Shared React component library for the Waypoint delivery platform.**
> Web port of `driver_mobile` — same design tokens, same component shapes, zero React Native dependencies.

---

## Table of Contents

1. [Overview](#overview)
2. [Package Structure](#package-structure)
3. [Installation](#installation)
4. [Quick Start](#quick-start)
5. [Components](#components)
   - [Badge](#badge)
   - [CarrotIcon](#carroticon)
   - [PrimaryButton](#primarybutton)
   - [SelectableCard](#selectablecard)
   - [SelectableChip](#selectablechip)
   - [OTPInput](#otpinput)
   - [OutletRow](#outletrow)
   - [WarehouseCard](#warehousecard)
   - [DeliveryConfirmationModal](#deliveryconfirmationmodal)
   - [ItemsListModal](#itemslistmodal)
6. [Design Tokens](#design-tokens)
   - [Colours](#colours)
   - [Spacing](#spacing)
   - [Font Sizes](#font-sizes)
   - [Font Weights](#font-weights)
   - [CSS Custom Properties](#css-custom-properties)
7. [Shared Types](#shared-types)
8. [Theming and Customisation](#theming-and-customisation)
9. [Keeping Web and Mobile in Sync](#keeping-web-and-mobile-in-sync)
10. [Troubleshooting](#troubleshooting)

---

## Overview

`@waypoint/ui` is a **React (web)** component library that mirrors the components built in `driver_mobile` (React Native). It exists so that every frontend in the monorepo — dispatcher dashboard, store-manager portal, loader UI, etc. — shares the same visual language as the mobile driver app without pulling in any React Native runtime.

**Key principles:**

- Every colour, spacing step, and font-size value is **identical** to `driver_mobile/src/utils/constants.ts`
- Every component has the **same prop shape** as its mobile counterpart (with minor web-specific name changes noted per component)
- Zero peer dependencies beyond `react` and `react-dom`
- Full TypeScript support — all types are exported from the package
- CSS custom properties (`--wp-*`) allow you to **theme** the entire library by overriding variables in your own stylesheet

---

## Package Structure

```
packages/ui/
|
+-- src/
|   +-- index.ts                          <- Single public entry point
|   +-- tokens.ts                         <- Design tokens as TypeScript constants
|   +-- styles.css                        <- CSS custom properties + keyframe animations
|   |
|   +-- types/
|   |   +-- trip.ts                       <- Shared domain types (TripNode, InventoryItem, ...)
|   |
|   +-- components/
|       +-- Badge.tsx                     <- Coloured pill tag with optional icon
|       +-- CarrotIcon.tsx                <- SVG icon (inline, no extra deps)
|       +-- PrimaryButton.tsx             <- Full-width button (solid / outline / cyan)
|       +-- SelectableCard.tsx            <- Tappable grid card (e.g. vehicle type picker)
|       +-- SelectableChip.tsx            <- Inline toggleable tag
|       +-- OTPInput.tsx                  <- N-digit OTP entry with auto-advance
|       +-- OutletRow.tsx                 <- Delivery stop row in a trip list
|       +-- WarehouseCard.tsx             <- Warehouse card with arrive / depart times
|       +-- DeliveryConfirmationModal.tsx <- OTP verification modal with countdown timer
|       +-- ItemsListModal.tsx            <- Scrollable inventory checklist modal
|
+-- package.json                          <- name: "@waypoint/ui"
+-- tsconfig.json
+-- README.md
```

---

## Installation

This package lives inside the monorepo and is managed by **npm workspaces** — no manual linking needed.

**Step 1 — Add the dependency to your frontend's `package.json`:**

```json
{
  "dependencies": {
    "@waypoint/ui": "*"
  }
}
```

**Step 2 — Install from the monorepo root:**

```bash
# Run this from the REPO ROOT, not from inside your frontend folder
npm install
```

npm workspaces will automatically symlink `packages/ui` into `node_modules/@waypoint/ui` for every workspace that lists it as a dependency.

---

## Quick Start

```tsx
// 1. Import the stylesheet ONCE in your app entry point (main.tsx / _app.tsx / index.tsx)
import '@waypoint/ui/styles';

// 2. Import any components you need
import { PrimaryButton, Badge, COLORS } from '@waypoint/ui';

// 3. Use them like normal React components
function MyPage() {
  return (
    <div>
      <Badge label="DOCK 3" />
      <PrimaryButton title="Confirm Delivery" onClick={() => alert('confirmed!')} />
    </div>
  );
}
```

> **Why import the stylesheet?**
> `styles.css` sets all `--wp-*` CSS custom properties and the `@keyframes wp-spin` animation used by the loading spinner. Without it, spacing and animations may look off.

---

## Components

---

### Badge

A small coloured pill tag used for dock labels, status indicators, or any short piece of metadata.

**Import:**
```tsx
import { Badge } from '@waypoint/ui';
```

**Examples:**
```tsx
// Simple text badge
<Badge label="DOCK 3" />

// Custom colour
<Badge label="READY" backgroundColor="#16A34A" textColor="#fff" />

// Icon-only badge (as used in WarehouseCard)
import { Badge, CarrotIcon, COLORS } from '@waypoint/ui';
<Badge
  backgroundColor={COLORS.badgeYellow}
  icon={<CarrotIcon width={14} height={14} color={COLORS.iconYellow} />}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Text inside the badge |
| `backgroundColor` | `string` | `COLORS.badgeCyan` | Background colour |
| `textColor` | `string` | `COLORS.surface` | Text colour |
| `icon` | `ReactNode` | — | Element rendered alongside the label |
| `className` | `string` | `''` | Extra CSS class |

---

### CarrotIcon

An inline SVG icon. The path data is identical to the React Native version that used `react-native-svg`.

**Import:**
```tsx
import { CarrotIcon } from '@waypoint/ui';
```

**Examples:**
```tsx
<CarrotIcon />
<CarrotIcon width={20} height={20} color="#00416C" />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | `24` | Icon width in px |
| `height` | `number` | `24` | Icon height in px |
| `color` | `string` | `'currentColor'` | Stroke colour |
| `className` | `string` | `''` | Extra CSS class |

---

### PrimaryButton

Full-width action button with three visual variants, loading state, and optional icon slots.

> **Name change from mobile:** `onPress` is now `onClick`

**Import:**
```tsx
import { PrimaryButton } from '@waypoint/ui';
```

**Examples:**
```tsx
// Variants
<PrimaryButton title="Start Trip"  onClick={handleStart} />
<PrimaryButton title="Cancel"      variant="outline" onClick={handleCancel} />
<PrimaryButton title="Scan QR"     variant="cyan"    onClick={handleScan} />

// States
<PrimaryButton title="Submitting..." isLoading onClick={() => {}} />
<PrimaryButton title="Continue"      disabled  onClick={() => {}} />

// With icons (works with any icon library)
<PrimaryButton title="Next" onClick={next} iconRight={<ArrowRightIcon />} />

// As a form submit button
<PrimaryButton title="Submit" type="submit" onClick={() => {}} />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | **required** | Button label |
| `onClick` | `() => void` | **required** | Click handler |
| `variant` | `'solid' or 'outline' or 'cyan'` | `'solid'` | Visual style |
| `disabled` | `boolean` | `false` | Greys out and prevents clicks |
| `isLoading` | `boolean` | `false` | Shows spinner, disables button |
| `iconLeft` | `ReactNode` | — | Element to the left of the label |
| `iconRight` | `ReactNode` | — | Element to the right of the label |
| `type` | `'button' or 'submit' or 'reset'` | `'button'` | HTML button type |
| `style` | `React.CSSProperties` | — | Inline style overrides |
| `className` | `string` | `''` | Extra CSS class |

---

### SelectableCard

A pressable card for selection grids. Shows an emoji/icon above a title and highlights cyan when selected.

**Import:**
```tsx
import { SelectableCard } from '@waypoint/ui';
```

**Example:**
```tsx
const [vehicle, setVehicle] = useState('');

<div style={{ display: 'flex', flexWrap: 'wrap', gap: '4%' }}>
  {[
    { id: 'truck',   label: 'Truck',   icon: '🚛' },
    { id: 'van',     label: 'Van',     icon: '🚐' },
    { id: 'bike',    label: 'Bike',    icon: '🏍️' },
    { id: 'scooter', label: 'Scooter', icon: '🛵' },
  ].map((v) => (
    <SelectableCard
      key={v.id}
      title={v.label}
      icon={v.icon}
      isSelected={vehicle === v.id}
      onPress={() => setVehicle(v.id)}
    />
  ))}
</div>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | **required** | Label below the icon |
| `icon` | `string` | **required** | Emoji or character above the title |
| `isSelected` | `boolean` | **required** | Whether this card is active |
| `onPress` | `() => void` | **required** | Click handler |
| `className` | `string` | `''` | Extra CSS class |

---

### SelectableChip

Small inline toggleable tag. Shows a checkmark when selected.

**Import:**
```tsx
import { SelectableChip } from '@waypoint/ui';
```

**Example:**
```tsx
const [selected, setSelected] = useState<string[]>([]);

const toggle = (id: string) =>
  setSelected((prev) =>
    prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
  );

<div style={{ display: 'flex', flexWrap: 'wrap' }}>
  {['Morning', 'Afternoon', 'Evening', 'Night'].map((shift) => (
    <SelectableChip
      key={shift}
      title={shift}
      isSelected={selected.includes(shift)}
      onPress={() => toggle(shift)}
    />
  ))}
</div>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | **required** | Chip label |
| `isSelected` | `boolean` | **required** | Whether this chip is active |
| `onPress` | `() => void` | **required** | Click handler |
| `className` | `string` | `''` | Extra CSS class |

---

### OTPInput

N-box digit entry with auto-advance, backspace-retreat, and paste-to-fill.

**Import:**
```tsx
import { OTPInput } from '@waypoint/ui';
```

**Example:**
```tsx
import { useState } from 'react';
import { OTPInput, PrimaryButton } from '@waypoint/ui';

function VerifyScreen() {
  const [code, setCode] = useState(Array(6).fill(''));
  const allFilled = code.every((d) => d !== '');

  return (
    <>
      <OTPInput code={code} setCode={setCode} length={6} />
      <PrimaryButton
        title="Verify"
        onClick={() => console.log(code.join(''))}
        disabled={!allFilled}
      />
    </>
  );
}
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `code` | `string[]` | **required** | Controlled array — one string per digit box |
| `setCode` | `(code: string[]) => void` | **required** | State setter |
| `length` | `number` | `4` | Number of digit boxes |
| `className` | `string` | `''` | Extra CSS class |

Tip: initialise with `useState(Array(length).fill(''))`.

---

### OutletRow

Displays a single delivery stop in a trip list. Shows the sequence number, title, badge, location, scheduled window, and optional estimated arrival.

**Import:**
```tsx
import { OutletRow } from '@waypoint/ui';
import type { TripNode } from '@waypoint/ui';
```

**Example:**
```tsx
const node: TripNode = {
  id: 'stop-1',
  type: 'outlet',
  sequence: 2,
  title: 'City Supermart',
  badgeText: 'PENDING',
  location: 'Colombo 03',
  scheduledStart: '09:00',
  scheduledEnd: '09:30',
  estimatedArrival: '09:15',
  status: 'pending',
  logs: [],
  inventory: [],
};

<OutletRow node={node} />
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `node` | `TripNode` | **required** | The trip stop data object |
| `className` | `string` | `''` | Extra CSS class |

---

### WarehouseCard

Shows warehouse info with badge labels and an arrive/depart time pair.

**Import:**
```tsx
import { WarehouseCard } from '@waypoint/ui';
```

**Example:**
```tsx
<WarehouseCard
  title="Peliyagoda Warehouse"
  badgeText="DOCK 3"
  arriveTime="07:30"
  departTime="08:15"
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | **required** | Warehouse name |
| `badgeText` | `string` | **required** | Text in the cyan dock badge |
| `arriveTime` | `string` | **required** | Arrive time (e.g. `"07:30"`) |
| `departTime` | `string` | **required** | Depart time (e.g. `"08:15"`) |
| `className` | `string` | `''` | Extra CSS class |

---

### DeliveryConfirmationModal

OTP verification modal with countdown timer. The driver enters a code shown in the store manager app to confirm delivery.

Features: countdown timer, auto-show Verify button when all digits filled, Escape-to-close, backdrop-click-to-close, body scroll lock, ARIA dialog attributes.

**Import:**
```tsx
import { DeliveryConfirmationModal } from '@waypoint/ui';
```

**Example:**
```tsx
const [open, setOpen] = useState(false);

const handleVerify = (code: string) => {
  console.log('OTP:', code);
  setOpen(false);
};

<>
  <button onClick={() => setOpen(true)}>Confirm Delivery</button>

  <DeliveryConfirmationModal
    visible={open}
    onClose={() => setOpen(false)}
    onConfirm={handleVerify}
    otpLength={6}
    timerSeconds={112}
  />
</>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `visible` | `boolean` | **required** | Whether the modal is open |
| `onClose` | `() => void` | **required** | Called when dismissed |
| `onConfirm` | `(code: string) => void` | **required** | Called with joined OTP on Verify |
| `otpLength` | `number` | `6` | Number of OTP digit boxes |
| `timerSeconds` | `number` | `112` | Countdown duration in seconds |

---

### ItemsListModal

Scrollable inventory checklist. Items where `actual < expected` are flagged in red.

**Import:**
```tsx
import { ItemsListModal } from '@waypoint/ui';
import type { InventoryItem } from '@waypoint/ui';
```

**Example:**
```tsx
const items: InventoryItem[] = [
  { id: '1', name: 'Coca-Cola 330ml x24', expected: 5, actual: 5 },
  { id: '2', name: 'Water 500ml x12',     expected: 3, actual: 2 }, // red - mismatch
  { id: '3', name: 'Juice 1L x6',         expected: 4, actual: 4 },
];

<ItemsListModal
  visible={open}
  onClose={() => setOpen(false)}
  items={items}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `visible` | `boolean` | **required** | Whether the modal is open |
| `onClose` | `() => void` | **required** | Called when dismissed |
| `items` | `InventoryItem[]` | **required** | Inventory items to display |

---

## Design Tokens

### Colours

```tsx
import { COLORS } from '@waypoint/ui';
```

| Token | Value | Usage |
|-------|-------|-------|
| `COLORS.primaryDark` | `#00416C` | Primary brand colour, solid button |
| `COLORS.primaryLight` | `#55D3F3` | Cyan button background |
| `COLORS.background` | `#F8F9FA` | Page/screen background |
| `COLORS.surface` | `#FFFFFF` | Card/modal background |
| `COLORS.textMain` | `#2E3538` | Primary text |
| `COLORS.textSecondary` | `#5C6970` | Muted/secondary text |
| `COLORS.success` | `#16A34A` | Success states |
| `COLORS.danger` | `#FF334E` | Errors, mismatches, depart time |
| `COLORS.border` | `#E5E7EB` | Card borders, dividers |
| `COLORS.shade` | `#CCD9E259` | Warehouse card background |
| `COLORS.warning` | `#D97706` | Estimated arrival text |
| `COLORS.badgeCyan` | `#009DC5` | Default badge background |
| `COLORS.badgeYellow` | `#FDE68A` | Edit icon badge background |
| `COLORS.iconYellow` | `#00416C` | Carrot icon stroke colour |

### Spacing

```tsx
import { SPACING } from '@waypoint/ui';
```

| Token | Value |
|-------|-------|
| `SPACING.sm` | `0.5rem` (8 px) |
| `SPACING.md` | `1rem` (16 px) |
| `SPACING.lg` | `1.5rem` (24 px) |
| `SPACING.xl` | `2rem` (32 px) |
| `SPACING.xxl` | `3rem` (48 px) |
| `SPACING.xxxl` | `4rem` (64 px) |

### Font Sizes

```tsx
import { FONT_SIZE } from '@waypoint/ui';
```

| Token | Value |
|-------|-------|
| `FONT_SIZE.sm` | `0.875rem` (14 px) |
| `FONT_SIZE.md` | `1rem` (16 px) |
| `FONT_SIZE.lg` | `1.25rem` (20 px) |
| `FONT_SIZE.xl` | `1.5rem` (24 px) |
| `FONT_SIZE.xxl` | `1.875rem` (30 px) |

### Font Weights

```tsx
import { FONT_WEIGHT } from '@waypoint/ui';
```

| Token | Value |
|-------|-------|
| `FONT_WEIGHT.regular` | `'400'` |
| `FONT_WEIGHT.medium` | `'500'` |
| `FONT_WEIGHT.semibold` | `'600'` |
| `FONT_WEIGHT.bold` | `'700'` |

### CSS Custom Properties

After importing `@waypoint/ui/styles`, these variables are available in any stylesheet:

| CSS variable | Token equivalent |
|---|---|
| `--wp-color-primary-dark` | `COLORS.primaryDark` |
| `--wp-color-primary-light` | `COLORS.primaryLight` |
| `--wp-color-background` | `COLORS.background` |
| `--wp-color-surface` | `COLORS.surface` |
| `--wp-color-text-main` | `COLORS.textMain` |
| `--wp-color-text-secondary` | `COLORS.textSecondary` |
| `--wp-color-success` | `COLORS.success` |
| `--wp-color-danger` | `COLORS.danger` |
| `--wp-color-border` | `COLORS.border` |
| `--wp-color-warning` | `COLORS.warning` |
| `--wp-color-badge-cyan` | `COLORS.badgeCyan` |
| `--wp-space-sm / md / lg / xl / xxl` | `SPACING.*` |
| `--wp-font-size-sm / md / lg / xl / xxl` | `FONT_SIZE.*` |
| `--wp-font-weight-regular / medium / bold` | `FONT_WEIGHT.*` |
| `--wp-radius-sm` | `4px` |
| `--wp-radius-md` | `8px` |
| `--wp-radius-lg` | `12px` |
| `--wp-transition` | `150ms ease` |

---

## Shared Types

All types are exported so React frontends do not need to import from `driver_mobile`.

```tsx
import type { TripNode, TripLog, TripPayload, InventoryItem } from '@waypoint/ui';
```

---

## Theming and Customisation

Override any CSS variable in your own stylesheet — changes apply globally to all components:

```css
/* my-app/src/index.css */
:root {
  --wp-color-primary-dark: #1e40af;
  --wp-color-primary-light: #93c5fd;
  --wp-space-md: 0.75rem;
}
```

---

## Keeping Web and Mobile in Sync

When a component changes in `driver_mobile/src/components/`, apply the same logic to `packages/ui/src/components/`.

| React Native | React (web) |
|---|---|
| `View` | `div` |
| `Text` | `span`, `p`, semantic HTML |
| `TouchableOpacity` | `button` |
| `TextInput` | `input` |
| `Modal` | fixed overlay `div` with `role="dialog"` |
| `FlatList` | `ul` + `.map()` |
| `StyleSheet.create({})` | `React.CSSProperties` |
| `react-native-svg Svg/Path` | native `svg`/`path` |
| `scale(n)` | `rem` equivalent (see token table) |
| `onPress` | `onClick` |

Things to add when porting to web:
- `onKeyDown` for Escape on modals
- `document.body.style.overflow = 'hidden'` scroll lock on modals
- `aria-*` attributes
- `onPaste` support for OTP inputs

---

## Troubleshooting

**Styles are missing / spacing looks wrong**
Make sure `import '@waypoint/ui/styles'` is in your app root file, before any components render.

**TypeScript error: Cannot find module '@waypoint/ui'**
Run `npm install` from the monorepo root (not from inside your frontend). The workspace symlink is created at install time.

**TypeScript error: Module has no exported member '...'**
Check `packages/ui/src/index.ts` — all exports are listed there. If you added a new component, add its export to the barrel file.

**Spinner does not animate**
The `@keyframes wp-spin` rule is defined in `styles.css`. Import it once in your app root.
