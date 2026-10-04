import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { useNetworkSync } from './src/hooks/useNetworkSync';
import SafeDrivingOverlay from './src/components/SafeDrivingOverlay';

export default function App() {
  // Initialize background network sync
  useNetworkSync();

  return (
    // SafeAreaProvider ensures your app doesn't overlap with the notch or status bar on your Pixel
    <SafeAreaProvider>
      <AppNavigator />
      <SafeDrivingOverlay />
    </SafeAreaProvider>
  );
}