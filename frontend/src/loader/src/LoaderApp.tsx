import React, { useState, useEffect, useCallback } from 'react';
import { LoaderPinEntry } from './components/LoaderPinEntry';
import { ReadyToLoadScreen } from './components/ReadyToLoadScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { CompletedScreen } from './components/CompletedScreen';
import { LoadingDetailScreen } from './components/LoadingDetailScreen';
import { FinalCheckScreen } from './components/FinalCheckScreen';
import { login, getProfile, isAuthenticated, logout, AuthUser } from './api/authApi';
import { getActiveTrips, getManifest, LoadingItem, Vehicle } from './api/executionApi';
import { outlets } from './data/mockData';

type Screen = 'pin' | 'queue' | 'loading' | 'completed' | 'detail' | 'finalCheck';

export default function LoaderApp() {
  const [screen, setScreen] = useState<Screen>('pin');
  const [workerName, setWorkerName] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingItems, setLoadingItems] = useState<LoadingItem[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      getProfile()
        .then((profile) => {
          setUser(profile);
          setWorkerName(profile.fullName);
          setScreen('queue');
        })
        .catch(() => logout());
    }
  }, []);

  // Fetch vehicles when entering queue screens
  useEffect(() => {
    if (screen === 'queue' || screen === 'loading' || screen === 'completed') {
      setIsLoading(true);
      setError('');
      setVehicles([]); // Clear old data before fetching new
      const status = screen === 'queue' ? 'ready_to_load' : screen === 'loading' ? 'loading' : 'completed';
      getActiveTrips('Peliyagoda', status)
        .then(setVehicles)
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false));
    }
  }, [screen]);

  // Fetch manifest when entering detail screen
  useEffect(() => {
    if (screen === 'detail') {
      setIsLoading(true);
      getManifest('trip_001')
        .then((manifest) => setLoadingItems(manifest.items))
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false));
    }
  }, [screen]);

  const handleLogin = useCallback(async (pin: string) => {
    setIsLoading(true);
    setError('');
    try {
      // Map PIN to actual password (demo purposes)
      const password = pin === '1234' ? 'Password123!' : pin;
      const response = await login('loader_peliyagoda', password);
      setUser(response.user);
      setWorkerName(response.user.fullName);
      // Prefetch vehicles before navigating to queue
      try {
        const trips = await getActiveTrips('Peliyagoda');
        setVehicles(trips);
      } catch {
        // Vehicles will be fetched by useEffect if this fails
      }
      setScreen('queue');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      // Show a user-friendly message for wrong credentials
      if (message.includes('401') || message.includes('Unauthorized') || message.includes('Invalid')) {
        setError('Wrong PIN. Please try again.');
      } else {
        setError(message);
      }
      throw err; // Re-throw so LoaderPinEntry knows login failed
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleStartLoading = (vehicleId: string) => {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (vehicle) {
      setSelectedVehicle(vehicle);
      setScreen('detail');
    }
  };

  const handleView = (vehicleId: string) => {
    console.log('View:', vehicleId);
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setWorkerName('');
    setScreen('pin');
  };

  if (screen === 'pin') {
    return (
      <LoaderPinEntry
        onSuccess={handleLogin}
        isLoading={isLoading}
        error={error}
        depot="Peliyagoda"
        dock="Dock 03"
        vehiclesBefore={vehicles.length}
        cutoffTime="04:00 AM"
      />
    );
  }

  if (screen === 'detail') {
    return (
      <LoadingDetailScreen
        vehicle={selectedVehicle || vehicles[0]}
        outlets={outlets}
        items={loadingItems}
        onBack={() => setScreen('queue')}
        onFinish={() => setScreen('finalCheck')}
      />
    );
  }

  if (screen === 'finalCheck') {
    return (
      <FinalCheckScreen
        vehicle={vehicles[0] || {
          vehicle_id: 'VEH056',
          type: 'truck',
          temp: 'reefer',
          weight_cap_kg: 5000,
          volume_cap_m3: 20,
          fuel_type: 'diesel',
          km_per_l: 8,
          weekly_fuel_quota_l: 100,
          depot: 'Peliyagoda',
          status: 'available',
        }}
        outlets={outlets}
        onBack={() => setScreen('detail')}
        onRelease={() => setScreen('queue')}
      />
    );
  }

  if (screen === 'loading') {
    return (
      <LoadingScreen
        vehicles={vehicles}
        isLoading={isLoading}
        depot="Peliyagoda"
        dock="Dock 03"
        workerName={workerName}
        vehiclesBefore={vehicles.length}
        cutoffTime="04:00 AM"
        onView={handleView}
        onBack={() => setScreen('queue')}
        onNext={() => setScreen('completed')}
      />
    );
  }

  if (screen === 'completed') {
    return (
      <CompletedScreen
        vehicles={vehicles}
        isLoading={isLoading}
        depot="Peliyagoda"
        dock="Dock 03"
        workerName={workerName}
        vehiclesBefore={vehicles.length}
        cutoffTime="04:00 AM"
        onView={handleView}
        onBack={() => setScreen('loading')}
        onNext={() => setScreen('queue')}
      />
    );
  }

  return (
    <ReadyToLoadScreen
      vehicles={vehicles}
      isLoading={isLoading}
      depot="Peliyagoda"
      dock="Dock 03"
      workerName={workerName}
      vehiclesBefore={vehicles.length}
      cutoffTime="04:00 AM"
      onStartLoading={handleStartLoading}
      onBack={() => setScreen('completed')}
      onNext={() => setScreen('loading')}
    />
  );
}
