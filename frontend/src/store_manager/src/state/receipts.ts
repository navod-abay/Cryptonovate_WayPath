import type { IssueReport } from '@/types';

/**
 * Item reports made while unloading, kept on this device until the receipt is sent.
 *
 * The receipt (POST /orders/:orderRef/receipt) can only be recorded once the order is delivered,
 * i.e. after the driver has entered the handover code — or, during a network outage, once the
 * driver's offline delivery proof reaches the server. Until then the reports live here, in
 * localStorage, so they survive a reload or a closed browser.
 */
export interface ReceiptDraft {
  reports: IssueReport[];
  /** The manager finished the receipt; send it as soon as the delivery is delivered. */
  queued: boolean;
}

const key = (outletId: string) => `waypath.sm.receipts.${outletId}`;

export function loadDrafts(outletId: string): Record<string, ReceiptDraft> {
  try {
    const raw = localStorage.getItem(key(outletId));
    return raw ? (JSON.parse(raw) as Record<string, ReceiptDraft>) : {};
  } catch {
    return {};
  }
}

export function saveDraft(outletId: string, deliveryId: string, draft: ReceiptDraft | null) {
  const drafts = loadDrafts(outletId);
  if (draft) drafts[deliveryId] = draft;
  else delete drafts[deliveryId];
  try {
    localStorage.setItem(key(outletId), JSON.stringify(drafts));
  } catch {
    /* storage unavailable: reports stay in memory until the page is closed */
  }
}
