import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    // SafeAreaProvider ensures your app doesn't overlap with the notch or status bar on your Pixel
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}