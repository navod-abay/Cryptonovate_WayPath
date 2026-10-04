import { useState, useEffect, useCallback } from 'react';
import { LoaderPinEntry } from './components/LoaderPinEntry';
import { ReadyToLoadScreen } from './components/ReadyToLoadScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { CompletedScreen } from './components/CompletedScreen';
import { LoadingDetailScreen } from './components/LoadingDetailScreen';
import { FinalCheckScreen } from './components/FinalCheckScreen';
import { LabelSheet } from './components/LabelSheet';
import { pinLogin, getProfile, isAuthenticated, logout, AuthUser } from './api/authApi';
import { getActiveTrips, startLoading, Vehicle } from './api/executionApi';

type Screen = 'pin' | 'queue' | 'loading' | 'completed' | 'detail' | 'labels' | 'finalCheck';

/** The depot this kiosk stands in: a PIN identifies one of that depot's loaders. */
const KIOSK_DEPOT = import.meta.env.VITE_LOADER_DEPOT || 'Peliyagoda';
const DOCK = 'Dock 03';
const CUTOFF = '04:00 AM';

export default function LoaderApp() {
  const [screen, setScreen] = useState<Screen>('pin');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [outlets, setOutlets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const depot = user?.depot ?? KIOSK_DEPOT;
  const workerName = user?.fullName ?? '';

  // Check if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      getProfile()
        .then((profile) => {
          setUser(profile);
          setScreen('queue');
        })
        .catch(() => logout());
    }
  }, []);

  // The queue screens list the trips of the vehicles assigned to this loader, by loading status.
  useEffect(() => {
    if (user && (screen === 'queue' || screen === 'loading' || screen === 'completed')) {
      setIsLoading(true);
      setError('');
      setVehicles([]); // Clear old data before fetching new
      const status = screen === 'queue' ? 'ready_to_load' : screen === 'loading' ? 'loading' : 'completed';
      getActiveTrips(depot, status)
        .then(setVehicles)
        .catch((err) => setError(err.message))
        .finally(() => setIsLoading(false));
    }
  }, [screen, user, depot]);

  const handleLogin = useCallback(async (pin: string) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await pinLogin(KIOSK_DEPOT, pin);
      setUser(response.user);
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

  /** Start Loading (or resume one from the Loading queue): the trip moves to "Loading". */
  const handleStartLoading = async (tripId: string) => {
    const vehicle = vehicles.find((v) => v.tripId === tripId);
    if (!vehicle) return;
    try {
      await startLoading(tripId);
      setSelectedVehicle(vehicle);
      setScreen('detail');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start loading');
    }
  };

  const handleView = (tripId: string) => {
    console.log('View:', tripId);
  };

  if (screen === 'pin') {
    return (
      <LoaderPinEntry
        onSuccess={handleLogin}
        isLoading={isLoading}
        apiError={error}
        depot={KIOSK_DEPOT}
        dock={DOCK}
        vehiclesBefore={vehicles.length}
        cutoffTime={CUTOFF}
      />
    );
  }

  if (screen === 'detail' && selectedVehicle) {
    return (
      <LoadingDetailScreen
        vehicle={selectedVehicle}
        workerName={workerName}
        onBack={() => setScreen('queue')}
        onFinish={(stopOutlets) => {
          setOutlets(stopOutlets);
          setScreen('finalCheck');
        }}
        onShowLabels={() => setScreen('labels')}
      />
    );
  }

  if (screen === 'labels' && selectedVehicle) {
    return <LabelSheet tripId={selectedVehicle.tripId} onBack={() => setScreen('detail')} />;
  }

  if (screen === 'finalCheck' && selectedVehicle) {
    return (
      <FinalCheckScreen
        vehicle={selectedVehicle}
        outlets={outlets}
        workerName={workerName}
        onBack={() => setScreen('detail')}
        onRelease={() => setScreen('queue')}
      />
    );
  }

  // Queue screens have no error slot of their own.
  const errorBanner = error && (
    <div role="alert" className="fixed top-20 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <p className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-xl px-4 py-2 shadow">{error}</p>
    </div>
  );

  if (screen === 'loading') {
    return (
      <>
      {errorBanner}
      <LoadingScreen
        vehicles={vehicles}
        isLoading={isLoading}
        depot={depot}
        dock={DOCK}
        workerName={workerName}
        vehiclesBefore={vehicles.length}
        cutoffTime={CUTOFF}
        onView={(tripId) => void handleStartLoading(tripId)}
        onBack={() => setScreen('queue')}
        onNext={() => setScreen('completed')}
      />
      </>
    );
  }

  if (screen === 'completed') {
    return (
      <>
      {errorBanner}
      <CompletedScreen
        vehicles={vehicles}
        isLoading={isLoading}
        depot={depot}
        dock={DOCK}
        workerName={workerName}
        vehiclesBefore={vehicles.length}
        cutoffTime={CUTOFF}
        onView={handleView}
        onBack={() => setScreen('loading')}
        onNext={() => setScreen('queue')}
      />
      </>
    );
  }

  return (
    <>
    {errorBanner}
    <ReadyToLoadScreen
      vehicles={vehicles}
      isLoading={isLoading}
      depot={depot}
      dock={DOCK}
      workerName={workerName}
      vehiclesBefore={vehicles.length}
      cutoffTime={CUTOFF}
      onStartLoading={(tripId) => void handleStartLoading(tripId)}
      onBack={() => setScreen('completed')}
      onNext={() => setScreen('loading')}
    />
    </>
  );
}
