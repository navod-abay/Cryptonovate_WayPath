/**
 * Demo clock. Defaults to real time.
 * Add ?time=14:10 to the URL to pretend it is 14:10 today (the clock keeps ticking),
 * which is handy for showing the order-window states (open / closing / closed).
 */
let offsetMs = 0;

function readOverride() {
  if (typeof window === 'undefined') return;
  const t = new URLSearchParams(window.location.search).get('time');
  const m = t?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return;
  const target = new Date();
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  offsetMs = target.getTime() - Date.now();
}
readOverride();

export const now = () => new Date(Date.now() + offsetMs);
