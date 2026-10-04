import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch } from '../api/auth';
import { API_ROUTES } from '../api/config';

export interface OfflineDelivery {
  eventId: string; // client-generated event ID
  tripId: string;
  stopId: string;
  orderRef: string;
  outletId: string;
  vehicleId?: string;
  capturedAt: string;
  status: string;
  unloadedPhotos: string[];
  paperPhotos: string[];
}

const STORAGE_KEY = '@offline_deliveries_queue';

export const saveOfflineDelivery = async (delivery: Omit<OfflineDelivery, 'eventId'>) => {
  try {
    const existingQueueJSON = await AsyncStorage.getItem(STORAGE_KEY);
    const queue: OfflineDelivery[] = existingQueueJSON ? JSON.parse(existingQueueJSON) : [];
    
    const newTask: OfflineDelivery = {
      ...delivery,
      eventId: Date.now().toString(),
    };
    
    queue.push(newTask);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log('[SyncService] Saved offline delivery:', newTask.eventId);
  } catch (error) {
    console.error('[SyncService] Error saving offline delivery', error);
  }
};

export const syncOfflineDeliveries = async () => {
  try {
    const existingQueueJSON = await AsyncStorage.getItem(STORAGE_KEY);
    const queue: OfflineDelivery[] = existingQueueJSON ? JSON.parse(existingQueueJSON) : [];
    
    if (queue.length === 0) {
      return;
    }
    
    console.log(`[SyncService] Starting sync for ${queue.length} offline deliveries...`);
    
    const remainingQueue: OfflineDelivery[] = [];
    
    for (const delivery of queue) {
      try {
        const payload = {
          eventId: delivery.eventId,
          tripId: delivery.tripId,
          stopId: delivery.stopId,
          orderRef: delivery.orderRef,
          outletId: delivery.outletId,
          vehicleId: delivery.vehicleId,
          capturedAt: delivery.capturedAt,
          status: delivery.status,
          proofs: {
            unloadedPhotos: delivery.unloadedPhotos,
            paperPhotos: delivery.paperPhotos
          }
        };

        const res = await authFetch(`${API_ROUTES.EXECUTION}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
           throw new Error(`Server returned ${res.status}`);
        }
        
        console.log(`[SyncService] Successfully synced delivery: ${delivery.eventId}`);
      } catch (error) {
        console.error(`[SyncService] Failed to sync delivery: ${delivery.eventId}`, error);
        remainingQueue.push(delivery);
      }
    }
    
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(remainingQueue));
    if (remainingQueue.length === 0) {
      console.log('[SyncService] All offline deliveries synced successfully!');
    }
  } catch (error) {
    console.error('[SyncService] Error processing offline queue', error);
  }
};

export const getOfflineQueueCount = async (): Promise<number> => {
  try {
    const existingQueueJSON = await AsyncStorage.getItem(STORAGE_KEY);
    const queue: OfflineDelivery[] = existingQueueJSON ? JSON.parse(existingQueueJSON) : [];
    return queue.length;
  } catch (error) {
    return 0;
  }
};
