import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import CustomText from './CustomText';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../utils/constants';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Geolocation from '@react-native-community/geolocation';

export default function SafeDrivingOverlay() {
  const [isDriving, setIsDriving] = useState(false);

  useEffect(() => {
    // 1. Listen for manual events (from UI buttons)
    const subscription = DeviceEventEmitter.addListener('toggleDriving', (state: boolean) => {
      setIsDriving(state);
    });

    // 2. Listen to real GPS location
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        } catch (err) {
          console.warn(err);
        }
      }
    };
    
    requestPermissions();

    // Watch position in real-time
    const watchId = Geolocation.watchPosition(
      (position) => {
        const speed = position.coords.speed; // speed in meters/second
        // 2.77 m/s is approx 10 km/h
        if (speed !== null && speed > 2.77) {
          setIsDriving(true);
        } else if (speed !== null && speed <= 2.77) {
          setIsDriving(false);
        }
      },
      (error) => console.log('Geolocation Error:', error.message),
      { enableHighAccuracy: true, distanceFilter: 10, interval: 2000, fastestInterval: 1000 }
    );

    return () => {
      subscription.remove();
      Geolocation.clearWatch(watchId);
    };
  }, []);

  return (
    <>
      {/* The actual blocking overlay */}
      <Modal visible={isDriving} transparent={false} animationType="fade">
        <View style={styles.overlayContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="car-sport" size={scale(60)} color={COLORS.surface} />
          </View>
          
          <CustomText style={styles.title}>You are driving</CustomText>
          <CustomText style={styles.subtitle}>
            For your safety, interaction with the app is paused while the vehicle is in motion.
          </CustomText>

          {/* Hidden/Dev button to disable it for the demo */}
          <TouchableOpacity 
            style={styles.stopButton} 
            onPress={() => setIsDriving(false)}
            activeOpacity={0.8}
          >
            <CustomText style={styles.stopButtonText}>I have safely stopped</CustomText>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  devToggle: {
    position: 'absolute',
    top: scale(50),
    right: scale(10),
    backgroundColor: COLORS.error,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: scale(20),
    elevation: 5,
    zIndex: 9999, // Ensure it floats above the navigation
  },
  devToggleText: {
    color: COLORS.surface,
    fontWeight: FONT_WEIGHT.bold,
    fontSize: FONT_SIZE.xs,
    marginLeft: SPACING.xs,
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  iconCircle: {
    width: scale(120),
    height: scale(120),
    borderRadius: scale(60),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    color: COLORS.surface,
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    marginBottom: SPACING.md,
  },
  subtitle: {
    color: COLORS.surface,
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: scale(24),
  },
  stopButton: {
    marginTop: scale(60),
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderRadius: scale(30),
  },
  stopButtonText: {
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHT.bold,
    fontSize: FONT_SIZE.md,
  }
});
