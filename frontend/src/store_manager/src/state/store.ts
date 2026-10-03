import { useSyncExternalStore } from 'react';
import type {
  Delivery, Order, OrderLine, OrderType, Outlet, Product, Session, TruckCapacity, Update,
} from '@/types';

/**
 * Global client-side cache of what the API returned.
 * Pages read with useAppStore(selector); only files in src/api write to it.
 */
export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AppState {
  session: Session | null;
  /** Same as session.outlet; kept at the top level for convenient selectors. */
  outlet: Outlet;
  load: { status: LoadStatus; error: string | null };
  products: Product[];
  capacity: Partial<Record<OrderType, TruckCapacity>>;
  orders: Order[];
  deliveries: Delivery[];
  updates: Update[];
  lastOrderQty: Record<string, number>;
  missingFromLast: Record<OrderType, OrderLine[]>;
}

const SESSION_KEY = 'waypath.sm.session';

/** Placeholder used before login (pages are behind the login guard, so it is never shown). */
const NO_OUTLET: Outlet = { id: '', city: '', managerName: '', storeName: '', storeType: 'grocery', categories: [], address: '' };

export const emptyData = () => ({
  products: [] as Product[],
  capacity: {},
  orders: [] as Order[],
  deliveries: [] as Delivery[],
  updates: [] as Update[],
  lastOrderQty: {},
  missingFromLast: { chilled: [], dry: [], tech: [], style: [] } as Record<OrderType, OrderLine[]>,
});

export const emptyState = (): AppState => ({
  session: null,
  outlet: NO_OUTLET,
  load: { status: 'idle', error: null },
  ...emptyData(),
});

export function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the user just logs in again after a reload */
  }
}

export function loadSavedSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function initial(): AppState {
  const session = loadSavedSession();
  return session ? { ...emptyState(), session, outlet: session.outlet } : emptyState();
}

let state: AppState = initial();
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
