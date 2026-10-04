import { useSyncExternalStore } from 'react';
import { getFallbackCount, subscribeDataSource } from '../data/http';

export default function DataSourceNotice() {
  const count=useSyncExternalStore(subscribeDataSource,getFallbackCount);
  return count ? <div className="file-data-notice" role="status">Using local test data where APIs are unavailable.</div> : null;
}
