import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import WarehouseCard from '../../components/WarehouseCard';
import OutletRow from '../../components/OutletRow';
import { TripPayload } from '../../types/trip';
import Fontisto from 'react-native-vector-icons/Fontisto';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
};

export default function TripListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<TripPayload | null>(null);

  useEffect(() => {
    fetchCurrentTrip();
  }, []);

  const fetchCurrentTrip = async () => {
    setLoading(true);
    setTimeout(() => {
      // FULLY POPULATED MOCK DATA TO PREVENT CRASHES
      setTripData({
        activeTripId: "Trip 1",
        isStarted: false, 
        nodes: [
          { 
            id: 'w1', type: 'warehouse', sequence: 0, title: 'Peliyagoda Warehouse', badgeText: 'DOCK 3', location: 'Peliyagoda', scheduledStart: '02:30 AM', scheduledEnd: '03:30 AM', 
            status: 'pending', logs: [], 
            inventory: [] 
          },
          { 
            id: 'o1', type: 'outlet', sequence: 1, title: 'OUT001', badgeText: 'MALL BAY DOCK', location: 'Colombo', scheduledStart: '05:30 AM', scheduledEnd: '08:30 AM', 
            status: 'pending', logs: [], 
            inventory: [
              { id: '1', name: 'Diary Crates', expected: 6, actual: 5 }, // Mismatched for demo
              { id: '2', name: 'Fresh Milk Crates', expected: 5, actual: 5 }
            ] 
          },
          { 
            id: 'o2', type: 'outlet', sequence: 2, title: 'OUT018', badgeText: 'STREET', location: 'Colombo', scheduledStart: '07:00 AM', scheduledEnd: '05:00 PM', 
            status: 'pending', logs: [], 
            inventory: [] 
          },
        ]
      });
      setLoading(false);
    }, 1000);
  };

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

  // Header wrapped in TouchableOpacity
  const renderHeader = () => (
    <TouchableOpacity activeOpacity={0.8} onPress={() => handleCardPress(0)} style={{ marginBottom: SPACING.md }}>
      {warehouseNode && (
        <WarehouseCard 
          title={warehouseNode.title}
          badgeText={warehouseNode.badgeText}
          arriveTime={warehouseNode.scheduledStart}
          departTime={warehouseNode.scheduledEnd}
        />
      )}
    </TouchableOpacity>
  );

  const renderFooter = () => (
    <PrimaryButton 
      title={`Start ${tripData.activeTripId}`} 
      onPress={handleStartTrip} 
      style={{ marginTop: SPACING.lg, marginBottom: SPACING.xl }}
    />
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      {/* HEADER SECTION */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <View>
          <Text style={styles.greeting}>Hello Nimal !</Text>
          <Text style={styles.subGreeting}>02 Trips Today</Text>
        </View>
        <Fontisto name="history" style={{ color: COLORS.surface, fontSize: FONT_SIZE.xl }}/>
      </View>

      {/* TABS SECTION */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, styles.activeTab]}>
          <Text style={styles.activeTabText}>{tripData.activeTripId}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab}>
          <Text style={styles.inactiveTabText}>Trip 2</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={outletNodes}
        keyExtractor={(item) => item.id}
        // Outlet rows wrapped in TouchableOpacity
        renderItem={({ item, index }) => (
          <TouchableOpacity activeOpacity={0.8} onPress={() => handleCardPress(index + 1)}>
            <OutletRow node={item} />
          </TouchableOpacity>
        )}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.bottomNav, { paddingBottom: insets.bottom || SPACING.md }]}>
        <Text style={{ fontSize: FONT_SIZE.xl, color: COLORS.primaryDark }}>🏠</Text>
        <Text style={{ fontSize: FONT_SIZE.xl, color: COLORS.textSecondary }}>👤</Text>
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
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: COLORS.surface, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border }
});