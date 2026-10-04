import React, { useState, useEffect } from 'react';
import {View, StyleSheet, FlatList, StatusBar, TouchableOpacity, ActivityIndicator} from 'react-native';
import CustomText from '../../components/CustomText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import WarehouseCard from '../../components/WarehouseCard';
import OutletRow from '../../components/OutletRow';
import { TripPayload } from '../../types/trip';
import AntDesign from 'react-native-vector-icons/AntDesign';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PastTripDetails'>;
  route: RouteProp<RootStackParamList, 'PastTripDetails'>;
};

export default function PastTripDetailsScreen({ navigation, route }: Props) {
  const { tripId } = route.params;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [tripData, setTripData] = useState<TripPayload | null>(null);

  useEffect(() => {
    fetchTripDetails();
  }, [tripId]);

  const fetchTripDetails = async () => {
    setLoading(true);
    setTimeout(() => {
      // Mock data for the completed trip
      setTripData({
        activeTripId: tripId,
        isStarted: true, 
        nodes: [
          { 
            id: 'w1', type: 'warehouse', sequence: 0, title: 'Peliyagoda Warehouse', badgeText: 'DOCK 3', location: 'Peliyagoda', scheduledStart: '02:30 AM', scheduledEnd: '03:30 AM', 
            status: 'completed', logs: [{ time: '02:30 AM', action: 'Arrival' }, { time: '03:35 AM', action: 'Departure' }], 
            inventory: [] 
          },
          { 
            id: 'o1', type: 'outlet', sequence: 1, title: 'OUT001', badgeText: 'MALL BAY DOCK', location: 'Colombo', scheduledStart: '05:30 AM', scheduledEnd: '08:30 AM', 
            status: 'completed', logs: [{ time: '05:40 AM', action: 'Arrival' }, { time: '06:15 AM', action: 'Departure' }], 
            inventory: [
              { id: '1', name: 'Diary Crates', expected: 6, actual: 6 },
              { id: '2', name: 'Fresh Milk Crates', expected: 5, actual: 5 }
            ] 
          },
          { 
            id: 'o2', type: 'outlet', sequence: 2, title: 'OUT018', badgeText: 'STREET', location: 'Colombo', scheduledStart: '07:00 AM', scheduledEnd: '05:00 PM', 
            status: 'completed', logs: [{ time: '07:20 AM', action: 'Arrival' }, { time: '07:45 AM', action: 'Departure' }], 
            inventory: [] 
          },
        ]
      });
      setLoading(false);
    }, 800);
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

  const renderHeader = () => (
    <View style={{ marginBottom: SPACING.md }}>
      {warehouseNode && (
        <WarehouseCard 
          title={warehouseNode.title}
          badgeText={warehouseNode.badgeText}
          arriveTime={warehouseNode.scheduledStart}
          departTime={warehouseNode.scheduledEnd}
        />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* HEADER SECTION */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <AntDesign name="arrowleft" style={styles.backArrow} />
        </TouchableOpacity>
        <CustomText style={styles.headerTitle}>{tripId} Details</CustomText>
        <View style={styles.backButton} />
      </View>

      <FlatList
        data={outletNodes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ opacity: 0.8 }}>
            <OutletRow node={item} />
          </View>
        )}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: 'center', alignItems: 'center' },
  header: { 
    backgroundColor: COLORS.primaryDark, 
    paddingHorizontal: SPACING.lg, 
    paddingBottom: SPACING.lg, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  backButton: { width: scale(40) },
  backArrow: { color: COLORS.surface, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  headerTitle: { color: COLORS.surface, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
});
