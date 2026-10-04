import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncOfflineDeliveries } from '../services/SyncService';

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
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOnline]);

  return { isOnline };
};
