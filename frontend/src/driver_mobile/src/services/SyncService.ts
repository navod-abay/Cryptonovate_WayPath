import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OfflineDelivery {
  id: string; // unique ID for the offline task
  tripId: string;
  nodeId: string;
  unloadedPhotos: string[];
  paperPhotos: string[];
  timestamp: string;
}

const STORAGE_KEY = '@offline_deliveries_queue';

export const saveOfflineDelivery = async (delivery: Omit<OfflineDelivery, 'id'>) => {
  try {
    const existingQueueJSON = await AsyncStorage.getItem(STORAGE_KEY);
    const queue: OfflineDelivery[] = existingQueueJSON ? JSON.parse(existingQueueJSON) : [];
    
    const newTask: OfflineDelivery = {
      ...delivery,
      id: Date.now().toString(),
    };
    
    queue.push(newTask);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    console.log('[SyncService] Saved offline delivery:', newTask.id);
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
        // Here we would make the actual API call to the backend
        // e.g. await axios.post('/api/deliveries/offline-sync', delivery);
        
        // Simulating network delay for backend call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`[SyncService] Successfully synced delivery: ${delivery.id}`);
      } catch (error) {
        console.error(`[SyncService] Failed to sync delivery: ${delivery.id}`, error);
        // If it fails, we push it back to the queue to try again next time
        remainingQueue.push(delivery);
      }
    }
    
    // Update the queue with only the failed ones
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
