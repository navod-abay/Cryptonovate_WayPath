import React, { useState, useEffect } from 'react';
import {View, StyleSheet, FlatList, ScrollView, StatusBar, TouchableOpacity, ActivityIndicator, DeviceEventEmitter} from 'react-native';
import CustomText from '../../components/CustomText';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import WarehouseCard from '../../components/WarehouseCard';
import OutletRow from '../../components/OutletRow';
import { TripPayload } from '../../types/trip';
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

  useEffect(() => {
    fetchCurrentTrip();
  }, []);

  const fetchCurrentTrip = async () => {
    setLoading(true);
    setTimeout(() => {
      setTrips([
        {
          activeTripId: "Trip 1",
          isStarted: false, 
          nodes: [
            { id: 'w1', type: 'warehouse', sequence: 0, title: 'Peliyagoda Warehouse', badgeText: 'DOCK 3', location: 'Peliyagoda', scheduledStart: '02:30 AM', scheduledEnd: '03:30 AM', status: 'pending', logs: [], inventory: [] },
            { id: 'o1', type: 'outlet', sequence: 1, title: 'OUT001', badgeText: 'MALL BAY DOCK', location: 'Colombo', scheduledStart: '05:30 AM', scheduledEnd: '08:30 AM', estimatedArrival: '5:28 AM', status: 'pending', logs: [], inventory: [{ id: '1', name: 'Diary Crates', expected: 6, actual: 5 }, { id: '2', name: 'Fresh Milk Crates', expected: 5, actual: 5 }] },
            { id: 'o2', type: 'outlet', sequence: 2, title: 'OUT018', badgeText: 'STREET', location: 'Colombo', scheduledStart: '07:00 AM', scheduledEnd: '05:00 PM', estimatedArrival: '7:05 AM', status: 'pending', logs: [], inventory: [] },
          ]
        },
        {
          activeTripId: "Trip 2",
          isStarted: false, 
          nodes: [
            { id: 'w2', type: 'warehouse', sequence: 0, title: 'Kandy Warehouse', badgeText: 'DOCK 1', location: 'Kandy', scheduledStart: '01:00 PM', scheduledEnd: '02:00 PM', status: 'pending', logs: [], inventory: [] },
            { id: 'o3', type: 'outlet', sequence: 1, title: 'OUT022', badgeText: 'STREET', location: 'Kandy', scheduledStart: '02:30 PM', scheduledEnd: '04:30 PM', estimatedArrival: '2:15 PM', status: 'pending', logs: [], inventory: [] },
          ]
        }
      ]);
      setLoading(false);
    }, 1000);
  };
  
  const tripData = trips[activeTripIndex];

  if (loading || !tripData) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </View>
    );
  }

  const warehouseNode = tripData.nodes.find(n => n.type === 'warehouse');
  const outletNodes = tripData.nodes.filter(n => n.type === 'outlet');

  // Navigation handlers
  const handleCardPress = (index: number) => {
    navigation.navigate('ActiveTrip', { tripData, initialIndex: index });
  };

  const handleStartTrip = () => {
    // Flip isStarted to true when they click the main Start button
    const startedTrip = { ...tripData, isStarted: true };
    navigation.navigate('ActiveTrip', { tripData: startedTrip, initialIndex: 0 });
  };


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      {/* HEADER SECTION */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <View>
          <CustomText style={styles.greeting}>Hello Nimal !</CustomText>
          <CustomText style={styles.subGreeting}>02 Trips Today</CustomText>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Fontisto name="history" style={{ color: COLORS.surface, fontSize: FONT_SIZE.xl }}/>
        </TouchableOpacity>
      </View>

      {/* TABS SECTION */}
      <View style={styles.tabContainer}>
        {trips.map((trip, idx) => (
          <TouchableOpacity 
            key={idx} 
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
          title={`Start ${tripData.activeTripId}`} 
          onPress={handleStartTrip} 
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
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' }
});