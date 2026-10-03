import { useSyncExternalStore } from 'react';
import { createSeed, type SeedState } from '@/mock/seed';
import type { Outlet, Session } from '@/types';

/**
 * Tiny global store for the store manager app.
 * Pages read with useAppStore(selector); only src/api writes to it.
 * When the backend is connected, the API functions fetch and then call setState.
 */
export interface AppState extends SeedState {
  session: Session | null;
}

const SESSION_KEY = 'waypath.sm.session';

/** Placeholder used before login (pages are behind the login guard, so it is never shown). */
const NO_OUTLET: Outlet = { id: '', city: '', managerName: '', storeName: '', storeType: 'grocery', categories: [], address: '' };

export const emptyState = (): AppState => ({
  session: null,
  outlet: NO_OUTLET,
  orders: [],
  deliveries: [],
  updates: [],
  lastOrderQty: {},
  missingFromLast: { chilled: [], dry: [], tech: [], style: [] },
});

export const stateForSession = (session: Session): AppState => ({ ...createSeed(session.outlet), session });

export function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the user just logs in again after a reload */
  }
}

function restore(): AppState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return stateForSession(JSON.parse(raw) as Session);
  } catch {
    /* ignore */
  }
  return emptyState();
}

let state: AppState = restore();
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
