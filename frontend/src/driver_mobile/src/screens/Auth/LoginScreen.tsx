import React from 'react';
import {View, StyleSheet, SafeAreaView, StatusBar} from 'react-native';
import CustomText from '../../components/CustomText';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* Header Section */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}>
        <CustomText style={styles.logoText}>Waypoint Logistics</CustomText>
      </View>

      {/* Content Section */}
      <View style={styles.content}>
        <CustomText style={styles.statusText}>You have logged out!</CustomText>
        <PrimaryButton 
          title="Sign In" 
          variant="cyan" 
          onPress={() => navigation.navigate('PinLogin')} 
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  header: {
    paddingBottom: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)', // Subtle line if needed
  },
  logoText: {
    color: COLORS.surface,
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  statusText: {
    color: COLORS.surface,
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.medium,
    marginBottom: SPACING.md,
  },
});