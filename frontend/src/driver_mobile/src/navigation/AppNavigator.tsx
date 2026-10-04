import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TripPayload } from '../types/trip';
import { hasSession } from '../api/auth';
import { COLORS } from '../utils/constants';

import LoginScreen from '../screens/Auth/LoginScreen';
import PinLoginScreen from '../screens/Auth/PinLoginScreen';
// You will create this next
import TripListScreen from '../screens/Dashboard/TripListScreen'; 
import ProfileScreen from '../screens/Dashboard/ProfileScreen';
import HistoryScreen from '../screens/Dashboard/HistoryScreen';
import PastTripDetailsScreen from '../screens/Dashboard/PastTripDetailsScreen';
import ActiveTripScreen from '../screens/Trip/ActiveTripScreen';
import ReportIssueScreen from '../screens/Trip/ReportIssueScreen';

export type RootStackParamList = {
  Login: undefined; 
  PinLogin: undefined;
  Dashboard: undefined; 
  Profile: undefined;
  History: undefined;
  PastTripDetails: { tripId: string };
  ActiveTrip: { tripData: TripPayload; initialIndex?: number };
  ReportIssue: { tripId: string; nodeId: string; nodeTitle: string; outletId?: string; onReportSubmitted: () => void };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  // A driver who signed in earlier in the shift opens straight on their trips.
  const [initialRoute, setInitialRoute] = useState<'Login' | 'Dashboard' | null>(null);
  useEffect(() => {
    hasSession()
      .then((signedIn) => setInitialRoute(signedIn ? 'Dashboard' : 'Login'))
      .catch(() => setInitialRoute('Login'));
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primaryDark }}>
        <ActivityIndicator size="large" color={COLORS.surface} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PinLogin" component={PinLoginScreen} />
        <Stack.Screen name="Dashboard" component={TripListScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="PastTripDetails" component={PastTripDetailsScreen} />
        <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} />
        <Stack.Screen name="ReportIssue" component={ReportIssueScreen} />
        
      </Stack.Navigator>
    </NavigationContainer>
  );
}