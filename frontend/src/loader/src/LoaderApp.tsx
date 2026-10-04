import React, { useState } from 'react';
import { LoaderPinEntry } from './components/LoaderPinEntry';
import { ReadyToLoadScreen } from './components/ReadyToLoadScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { CompletedScreen } from './components/CompletedScreen';
import { LoadingDetailScreen } from './components/LoadingDetailScreen';
import { FinalCheckScreen } from './components/FinalCheckScreen';
import { demoVehicles, loadingVehicles, completedVehicles, loadingItems, outlets } from './data/mockData';

type Screen = 'pin' | 'queue' | 'loading' | 'completed' | 'detail' | 'finalCheck';

export default function LoaderApp() {
  const [screen, setScreen] = useState<Screen>('pin');
  const [workerName, setWorkerName] = useState('');

  const handleLogin = (pin: string) => {
    setWorkerName('Thilak S.');
    setScreen('queue');
  };

  const handleStartLoading = (vehicleId: string) => {
    console.log('Start loading:', vehicleId);
    setScreen('detail');
  };

  const handleView = (vehicleId: string) => {
    console.log('View:', vehicleId);
  };

  if (screen === 'pin') {
    return (
      <LoaderPinEntry
        onSuccess={handleLogin}
        depot="Peliyagoda"
        dock="Dock 03"
        vehiclesBefore={4}
        cutoffTime="04:00 AM"
      />
    );
  }

  if (screen === 'detail') {
    return (
      <LoadingDetailScreen
        vehicle={demoVehicles[0]}
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
        vehicle={demoVehicles[0]}
        outlets={outlets}
        onBack={() => setScreen('detail')}
        onRelease={() => setScreen('queue')}
      />
    );
  }

  if (screen === 'loading') {
    return (
      <LoadingScreen
        vehicles={loadingVehicles}
        depot="Peliyagoda"
        dock="Dock 03"
        workerName={workerName}
        vehiclesBefore={4}
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
        vehicles={completedVehicles}
        depot="Peliyagoda"
        dock="Dock 03"
        workerName={workerName}
        vehiclesBefore={4}
        cutoffTime="04:00 AM"
        onView={handleView}
        onBack={() => setScreen('loading')}
        onNext={() => setScreen('queue')}
      />
    );
  }

  return (
    <ReadyToLoadScreen
      vehicles={demoVehicles}
      depot="Peliyagoda"
      dock="Dock 03"
      workerName={workerName}
      vehiclesBefore={4}
      cutoffTime="04:00 AM"
      onStartLoading={handleStartLoading}
      onBack={() => setScreen('completed')}
      onNext={() => setScreen('loading')}
    />
  );
}
