import React, { useState, useEffect } from 'react';
import {View, StyleSheet, FlatList, ScrollView, StatusBar, TouchableOpacity, ActivityIndicator, DeviceEventEmitter, Alert} from 'react-native';
import CustomText from '../../components/CustomText';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import WarehouseCard from '../../components/WarehouseCard';
import OutletRow from '../../components/OutletRow';
import { TripPayload } from '../../types/trip';
import { AuthError, Driver, getDriver } from '../../api/auth';
import { fetchTodayTrips, startTrip } from '../../api/trips';
import { flushStopEvents } from '../../services/StopEvents';
import Fontisto from 'react-native-vector-icons/Fontisto';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

export default function TripListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [trips, setTrips] = useState<TripPayload[]>([]);
  const [activeTripIndex, setActiveTripIndex] = useState(0);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchCurrentTrip();
  }, []);

  // Back from a trip: send what is queued, then show what the server now has, without a spinner.
  useEffect(() => {
    return navigation.addListener('focus', () => {
      flushStopEvents()
        .then(fetchTodayTrips)
        .then((day) => setTrips(day.trips))
        .catch(() => {});
    });
  }, [navigation]);

  const fetchCurrentTrip = async () => {
    setLoading(true);
    setError('');
    try {
      setDriver(await getDriver());
      const day = await fetchTodayTrips();
      setTrips(day.trips);
      setVehicleId(day.vehicleId);
      setActiveTripIndex(0);
    } catch (err) {
      if (err instanceof AuthError) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not load your trips');
    } finally {
      setLoading(false);
    }
  };
  
  const tripData = trips[activeTripIndex];

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </View>
    );
  }

  if (!tripData) {
    // No plan for this vehicle today, or the trips could not be loaded.
    return (
      <View style={[styles.container, styles.center, { padding: SPACING.lg }]}>
        <CustomText style={styles.emptyTitle}>{error ? 'Could not load your trips' : 'No trips today'}</CustomText>
        <CustomText style={styles.emptyText}>
          {error || `${vehicleId || driver?.vehicleId || 'Your vehicle'} has no planned trips for today.`}
        </CustomText>
        <PrimaryButton title="Try again" onPress={fetchCurrentTrip} style={{ marginTop: SPACING.lg }} />
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ marginTop: SPACING.md }}>
          <CustomText style={styles.emptyLink}>Profile</CustomText>
        </TouchableOpacity>
      </View>
    );
  }

  // Trips run in order: a trip starts once every outlet of the trips before it is done (the server checks too).
  const unfinished = trips
    .slice(0, activeTripIndex)
    .find(t => t.nodes.some(n => n.type === 'outlet' && n.status !== 'completed'));
  const blocked = !tripData.isStarted && !!unfinished;

  const warehouseNode = tripData.nodes.find(n => n.type === 'warehouse');
  const outletNodes = tripData.nodes.filter(n => n.type === 'outlet');

  // Navigation handlers
  const handleCardPress = (index: number) => {
    navigation.navigate('ActiveTrip', { tripData, initialIndex: index });
  };

  const handleStartTrip = async () => {
    if (tripData.isStarted) {
      // Already started: carry on from the first stop not yet done.
      const next = tripData.nodes.findIndex((n) => n.status !== 'completed');
      navigation.navigate('ActiveTrip', { tripData, initialIndex: next === -1 ? tripData.nodes.length - 1 : next });
      return;
    }
    setStarting(true);
    try {
      await startTrip(tripData.tripId);
    } catch (err) {
      Alert.alert('Could not start the trip', err instanceof Error ? err.message : 'Check your connection and try again.');
      return;
    } finally {
      setStarting(false);
    }
    const startedTrip = { ...tripData, isStarted: true };
    setTrips((prev) => prev.map((t, i) => (i === activeTripIndex ? startedTrip : t)));
    navigation.navigate('ActiveTrip', { tripData: startedTrip, initialIndex: 0 });
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      {/* HEADER SECTION */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <View>
          <CustomText style={styles.greeting}>Hello {driver?.fullName.split(' ')[0] ?? 'Driver'} !</CustomText>
          <CustomText style={styles.subGreeting}>
            {String(trips.length).padStart(2, '0')} {trips.length === 1 ? 'Trip' : 'Trips'} Today · {vehicleId}
          </CustomText>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Fontisto name="history" style={{ color: COLORS.surface, fontSize: FONT_SIZE.xl }}/>
        </TouchableOpacity>
      </View>

      {/* TABS SECTION */}
      <View style={styles.tabContainer}>
        {trips.map((trip, idx) => (
          <TouchableOpacity 
            key={trip.tripId} 
            style={[styles.tab, activeTripIndex === idx && styles.activeTab]}
            onPress={() => setActiveTripIndex(idx)}
          >
            <CustomText style={activeTripIndex === idx ? styles.activeTabText : styles.inactiveTabText}>
              {trip.activeTripId}
            </CustomText>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardWrapper}>
          {warehouseNode && (
            <TouchableOpacity activeOpacity={0.8} onPress={() => handleCardPress(0)} style={{ marginBottom: SPACING.xsm }}>
              <WarehouseCard 
                title={warehouseNode.title}
                badgeText={warehouseNode.badgeText}
                arriveTime={warehouseNode.scheduledStart}
                departTime={warehouseNode.scheduledEnd}
                goodsType={warehouseNode.goodsType}
              />
            </TouchableOpacity>
          )}
          
          {outletNodes.map((item, index) => (
            <TouchableOpacity key={item.id} activeOpacity={0.8} onPress={() => handleCardPress(index + 1)} style={{ marginBottom: index === outletNodes.length - 1 ? 0 : SPACING.xsm }}>
              <OutletRow node={item} />
            </TouchableOpacity>
          ))}
        </View>

        <PrimaryButton 
          title={blocked ? `Finish ${unfinished!.activeTripId} first` : `${tripData.isStarted ? 'Continue' : 'Start'} ${tripData.activeTripId}`} 
          onPress={handleStartTrip} 
          disabled={blocked}
          isLoading={starting}
          style={{ marginTop: SPACING.lg, marginBottom: SPACING.xl }}
        />
      </ScrollView>

      {/* BOTTOM NAV */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="home" size={scale(24)} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="person-outline" size={scale(24)} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: COLORS.primaryDark, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { color: COLORS.surface, fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold },
  subGreeting: { color: COLORS.surface, fontSize: FONT_SIZE.sm, opacity: 0.8, marginTop: scale(4) },
  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: SPACING.md },
  activeTab: { borderBottomWidth: 2, borderBottomColor: COLORS.primaryDark },
  activeTabText: { color: COLORS.primaryDark, fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.md },
  inactiveTabText: { color: COLORS.tabInactive, fontWeight: FONT_WEIGHT.medium, fontSize: FONT_SIZE.md },
  listContent: { padding: SPACING.lg },
  cardWrapper: { borderWidth: 1, borderColor: COLORS.border, borderRadius: scale(12), padding: SPACING.sm, backgroundColor: 'transparent' },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.surface, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain, marginBottom: SPACING.sm },
  emptyText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center' },
  emptyLink: { fontSize: FONT_SIZE.sm, color: COLORS.primaryDark, fontWeight: FONT_WEIGHT.medium }
});