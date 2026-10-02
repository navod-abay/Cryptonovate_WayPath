import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TripPayload } from '../types/trip';

import LoginScreen from '../screens/Auth/LoginScreen';
import OTPScreen from '../screens/Auth/OTPScreen';
// You will create this next
import TripListScreen from '../screens/Dashboard/TripListScreen'; 
import ActiveTripScreen from '../screens/Trip/ActiveTripScreen';
import ReportIssueScreen from '../screens/Trip/ReportIssueScreen';

export type RootStackParamList = {
  Login: undefined; 
  OTP: undefined;
  Dashboard: undefined; 
  ActiveTrip: { tripData: TripPayload; initialIndex?: number };
  ReportIssue: { tripId: string; nodeId: string; nodeTitle: string; onReportSubmitted: () => void };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="OTP" component={OTPScreen} />
        <Stack.Screen name="Dashboard" component={TripListScreen} />
        <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} />
        <Stack.Screen name="ReportIssue" component={ReportIssueScreen} />
        
      </Stack.Navigator>
    </NavigationContainer>
  );
}