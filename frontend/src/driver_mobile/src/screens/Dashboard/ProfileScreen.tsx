import React, { useState, useEffect } from 'react';
import {View, StyleSheet, StatusBar, TouchableOpacity, ActivityIndicator, ScrollView} from 'react-native';
import CustomText from '../../components/CustomText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import Ionicons from 'react-native-vector-icons/Ionicons';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
};

export default function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    setLoading(true);
    setTimeout(() => {
      // Mock API call to get profile data
      setProfileData({
        driver: {
          name: "Nimal Perera",
          id: "DRV-84920",
          phone: "+94 77 123 4567",
          licenseNo: "B28493021",
        },
        vehicle: {
          number: "WP CAB 2934",
          type: "Freezer Truck",
          weight: "5000 kg",
          volume: "15 m³",
          weeklyFuelQuota: "120 L",
          remainingFuel: "45 L",
        }
      });
      setLoading(false);
    }, 800);
  };

  const handleLogout = () => {
    // Navigate to login
    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  };

  if (loading || !profileData) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primaryDark} />
      </View>
    );
  }

  const DataRow = ({ label, value }: { label: string, value: string }) => (
    <View style={styles.dataRow}>
      <CustomText style={styles.dataLabel}>{label}</CustomText>
      <CustomText style={styles.dataValue}>{value}</CustomText>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* HEADER SECTION */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <CustomText style={styles.headerTitle}>Driver Profile</CustomText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* DRIVER INFO SECTION */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CustomText style={styles.cardTitle}>Driver Information</CustomText>
          </View>
          <DataRow label="Name" value={profileData.driver.name} />
          <DataRow label="Driver ID" value={profileData.driver.id} />
          <DataRow label="Phone" value={profileData.driver.phone} />
          <DataRow label="License No" value={profileData.driver.licenseNo} />
        </View>

        {/* VEHICLE INFO SECTION */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <CustomText style={styles.cardTitle}>Vehicle Information</CustomText>
          </View>
          <DataRow label="Vehicle No" value={profileData.vehicle.number} />
          <DataRow label="Vehicle Type" value={profileData.vehicle.type} />
          <DataRow label="Weight" value={profileData.vehicle.weight} />
          <DataRow label="Volume" value={profileData.vehicle.volume} />
          <DataRow label="Weekly Fuel Quota" value={profileData.vehicle.weeklyFuelQuota} />
          <DataRow label="Remaining Fuel" value={profileData.vehicle.remainingFuel} />
        </View>

        {/* LOGOUT BUTTON */}
        <PrimaryButton 
          title="Logout" 
          onPress={handleLogout} 
          variant="outline"
          style={styles.logoutBtn}
        />
      </ScrollView>

      {/* BOTTOM NAV */}
      <View style={[styles.bottomNav, { paddingBottom: insets.bottom || SPACING.md }]}>
        <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Dashboard')}>
          <Ionicons name="home-outline" size={scale(24)} color={COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="person" size={scale(24)} color={COLORS.primaryDark} />
        </TouchableOpacity>
      </View>
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
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: { color: COLORS.surface, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxxl },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cardTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.primaryDark,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  dataLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHT.medium,
  },
  dataValue: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMain,
    fontWeight: FONT_WEIGHT.semibold,
  },
  logoutBtn: {
    marginTop: SPACING.lg,
  },
  bottomNav: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    backgroundColor: COLORS.surface, 
    paddingTop: SPACING.md, 
    borderTopWidth: 1, 
    borderTopColor: COLORS.border 
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  }
});
