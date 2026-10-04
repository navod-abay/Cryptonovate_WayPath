import { useSyncExternalStore } from 'react';

export interface Toast { id: number; tone: 'error' | 'success'; text: string }

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function showToast(text: string, tone: Toast['tone'] = 'error') {
  const id = ++seq;
  toasts = [...toasts, { id, tone, text }];
  emit();
  setTimeout(() => dismissToast(id), 6000);
}

/** Show an API error to the user. Use in catch blocks around API calls. */
export const showError = (err: unknown, fallback = 'Something went wrong. Please try again.') =>
  showToast(err instanceof Error && err.message ? err.message : fallback, 'error');

export function useToasts() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => toasts,
  );
}
