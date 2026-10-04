import { verifyHandover } from '../api/trips';
import { syncOfflineDeliveries, saveOfflineDelivery, getOfflineQueueCount } from '../services/SyncService';
import * as auth from '../api/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('../api/auth', () => ({
  authFetch: jest.fn(),
  errorMessage: jest.fn().mockReturnValue('Error'),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('Handover Verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call verifyHandover API and return response', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        success: true,
        data: {
          deliveryId: 'DEL-1',
          orderRef: 'ORD-1',
          status: 'delivered',
          verifiedAt: '2026-10-04T16:59:13.000Z',
        }
      })
    };
    (auth.authFetch as jest.Mock).mockResolvedValue(mockResponse);

    const result = await verifyHandover('stop-1', '123456', 'key-1');
    expect(auth.authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/deliveries/stop-1/handover/verify'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Idempotency-Key': 'key-1'
        })
      })
    );
    expect(result.data.status).toBe('delivered');
  });

  it('should throw error when verifyHandover fails', async () => {
    const mockResponse = {
      ok: false,
      status: 422,
      json: jest.fn().mockResolvedValue({ success: false })
    };
    (auth.authFetch as jest.Mock).mockResolvedValue(mockResponse);

    await expect(verifyHandover('stop-1', 'wrong', 'key-1')).rejects.toMatchObject({
      status: 422
    });
  });
});

describe('Offline Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should post offline events and clear queue', async () => {
    const mockQueue = [
      {
        eventId: 'event-1',
        tripId: 'trip-1',
        stopId: 'stop-1',
        orderRef: 'ord-1',
        outletId: 'out-1',
        vehicleId: 'veh-1',
        capturedAt: '2026-10-04',
        status: 'completed',
        unloadedPhotos: ['photo1.jpg'],
        paperPhotos: ['paper1.jpg']
      }
    ];

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockQueue));
    (auth.authFetch as jest.Mock).mockResolvedValue({ ok: true });

    await syncOfflineDeliveries();

    expect(auth.authFetch).toHaveBeenCalledWith(
      expect.stringContaining('/sync'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String)
      })
    );

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@offline_deliveries_queue',
      JSON.stringify([])
    );
  });
});
