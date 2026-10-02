import { useSyncExternalStore } from 'react';
import { createSeed, type SeedState } from '@/mock/seed';

/**
 * Tiny global store for the store manager app.
 * Pages read with useAppStore(selector); only src/api writes to it.
 * When the backend is connected, the API functions fetch and then call setState.
 */
export type AppState = SeedState;

let state: AppState = createSeed();
const listeners = new Set<() => void>();

export const getState = () => state;

export const setState = (updater: (s: AppState) => AppState) => {
  state = updater(state);
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Selector must return something already in state (not a new array/object). */
export function useAppStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}
