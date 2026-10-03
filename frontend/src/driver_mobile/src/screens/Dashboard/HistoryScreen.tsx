import React, { useState, useEffect } from 'react';
import {View, StyleSheet, StatusBar, TouchableOpacity, ActivityIndicator, FlatList} from 'react-native';
import CustomText from '../../components/CustomText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import AntDesign from 'react-native-vector-icons/AntDesign';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'History'>;
};

type HistoryItem = {
  id: string;
  date: string;
  status: string;
  outletsCount: number;
};

export default function HistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);

  useEffect(() => {
    fetchHistoryData();
  }, []);

  const fetchHistoryData = async () => {
    setLoading(true);
    setTimeout(() => {
      // Mock data for history
      setHistoryData([
        { id: "Trip 104", date: "Oct 3, 2026", status: "Completed", outletsCount: 4 },
        { id: "Trip 103", date: "Oct 2, 2026", status: "Completed", outletsCount: 2 },
        { id: "Trip 102", date: "Sep 30, 2026", status: "Completed", outletsCount: 5 },
        { id: "Trip 101", date: "Sep 28, 2026", status: "Completed", outletsCount: 3 },
        { id: "Trip 100", date: "Sep 27, 2026", status: "Completed", outletsCount: 4 },
      ]);
      setLoading(false);
    }, 800);
  };

  const renderHistoryItem = ({ item }: { item: HistoryItem }) => (
    <TouchableOpacity 
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('PastTripDetails', { tripId: item.id })}
    >
      <View style={styles.cardHeader}>
        <CustomText style={styles.tripTitle}>{item.id}</CustomText>
        <CustomText style={styles.statusBadge}>{item.status}</CustomText>
      </View>
      <View style={styles.cardBody}>
        <CustomText style={styles.cardText}>Date: {item.date}</CustomText>
        <CustomText style={styles.cardText}>Outlets Visited: {item.outletsCount}</CustomText>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* HEADER SECTION */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <AntDesign name="arrowleft" style={styles.backArrow} />
        </TouchableOpacity>
        <CustomText style={styles.headerTitle}>Trip History</CustomText>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primaryDark} />
        </View>
      ) : (
        <FlatList
          data={historyData}
          keyExtractor={(item) => item.id}
          renderItem={renderHistoryItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <CustomText style={styles.emptyText}>No trip history found.</CustomText>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    backgroundColor: COLORS.primaryDark, 
    paddingHorizontal: SPACING.lg, 
    paddingBottom: SPACING.lg, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: { color: COLORS.surface, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  backButton: { width: scale(40) },
  backArrow: { color: COLORS.surface, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  listContent: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  tripTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primaryDark,
  },
  statusBadge: {
    backgroundColor: COLORS.success,
    color: COLORS.surface,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    overflow: 'hidden'
  },
  cardBody: {
    flexDirection: 'column',
    gap: 4
  },
  cardText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  }
});
