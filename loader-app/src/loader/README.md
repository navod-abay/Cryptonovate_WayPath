# Loader Portal — Pure React

Standalone React components for the Loader role. No Next.js required.

## Files

| File | Purpose |
|------|---------|
| `components/LoaderPinEntry.tsx` | Main PIN entry screen (orchestrator) |
| `components/LoaderInfoPanel.tsx` | Left panel — branding, clock, vehicle count |
| `components/PinDisplay.tsx` | PIN input display (X X X X) |
| `components/NumericKeypad.tsx` | Numeric keypad (1-9, 0, Clear, Backspace) |
| `LoaderApp.tsx` | Demo app wrapper with auth state |
| `main.tsx` | React entry point (for Vite/CRA) |

## Usage

### In a Vite React App

```tsx
import LoaderApp from './loader/LoaderApp';

function App() {
  return <LoaderApp />;
}
```

### In a CRA React App

```tsx
import { LoaderPinEntry } from './loader/components/LoaderPinEntry';

function App() {
  return (
    <LoaderPinEntry
      onSuccess={(pin) => console.log('PIN:', pin)}
      depot="Peliyagoda"
      dock="Dock 03"
      vehiclesBefore={4}
      cutoffTime="04:00 AM"
    />
  );
}
```

## Props

### LoaderPinEntry

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onSuccess` | `(pin: string) => void` | — | Called when PIN is complete |
| `onCancel` | `() => void` | — | Called when Cancel is clicked |
| `depot` | `string` | `'Peliyagoda'` | Depot name |
| `dock` | `string` | `'Dock 03'` | Dock identifier |
| `vehiclesBefore` | `number` | `4` | Vehicles before cutoff |
| `cutoffTime` | `string` | `'04:00 AM'` | Cutoff time |
| `maxPinLength` | `number` | `4` | PIN length |

## Tech Stack

- React 18+
- TypeScript
- Tailwind CSS
- No Next.js dependencies
