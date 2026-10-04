import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncOfflineDeliveries } from '../services/SyncService';
import { flushIncidents } from '../services/IncidentReports';

// Queued incident reports are retried this often while the app is open (cheap when the queue is empty).
const INCIDENT_RETRY_MS = 60_000;

export const useNetworkSync = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener(state => {
      const currentlyOnline = state.isConnected && state.isInternetReachable !== false;
      
      // If we transition from offline to online, trigger the sync
      if (!isOnline && currentlyOnline) {
        console.log('[useNetworkSync] Network connection restored. Triggering sync...');
        syncOfflineDeliveries();
        flushIncidents();
      }
      
      setIsOnline(!!currentlyOnline);
    });

    // Check initial network state
    NetInfo.fetch().then(state => {
      const currentlyOnline = !!(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(currentlyOnline);
      
      // Also attempt a sync right when the app opens, just in case there are leftover tasks!
      if (currentlyOnline) {
        syncOfflineDeliveries();
        flushIncidents();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOnline]);

  useEffect(() => {
    const id = setInterval(flushIncidents, INCIDENT_RETRY_MS);
    return () => clearInterval(id);
  }, []);

  return { isOnline };
};
