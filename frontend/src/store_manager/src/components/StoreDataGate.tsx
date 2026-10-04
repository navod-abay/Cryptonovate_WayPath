import { useEffect, type ReactNode } from 'react';
import { PrimaryButton } from '@waypoint/ui';
import { loadStoreData, refreshLiveData } from '@/api/storeManagerApi';
import { POLL_INTERVAL_MS } from '@/api/config';
import { useAppStore } from '@/state/store';
import './StoreDataGate.css';

/**
 * Loads the store's data once after sign-in, shows a loading / error screen until it is ready,
 * then keeps deliveries and updates fresh by polling.
 */
export default function StoreDataGate({ children }: { children: ReactNode }) {
  const { status, error } = useAppStore((s) => s.load);
  const token = useAppStore((s) => s.session?.token);

  useEffect(() => {
    if (token && status === 'idle') void loadStoreData();
  }, [token, status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const id = setInterval(() => { refreshLiveData().catch(() => undefined); }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'ready') return <>{children}</>;
  if (status === 'error') {
    return (
      <main className="sm-gate">
        <p className="sm-gate__title">We couldn’t load your store data.</p>
        <p className="sm-muted">{error}</p>
        <div style={{ width: 240 }}>
          <PrimaryButton title="Try again" onClick={() => void loadStoreData()} style={{ borderRadius: 16 }} />
        </div>
      </main>
    );
  }
  return (
    <main className="sm-gate" aria-busy="true">
      <span className="sm-gate__spinner" aria-hidden />
      <p className="sm-muted">Loading your store…</p>
    </main>
  );
}
