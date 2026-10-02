import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import OTPInput from '../../components/OTPInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'OTP'>;
};

export default function OTPScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
  const [otpCode, setOtpCode] = useState<string[]>(['', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = () => {
    setIsLoading(true);
    // TODO: Send OTP to Port 5001 (Auth & RBAC microservice)
    setTimeout(() => {
      setIsLoading(false);
      navigation.replace('Dashboard'); // Move to the main app
    }, 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      
      {/* Header Section */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}>
        <Text style={styles.logoText}>Waypoint Logistics</Text>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <Text style={styles.title}>Enter the code we sent you</Text>
        <Text style={styles.subtitle}>Sent to +94 70 xxx xx41</Text>
        
        <OTPInput code={otpCode} setCode={setOtpCode} length={6} />
      </View>

      {/* Footer Section */}
      <View style={styles.footer}>
        <Text style={styles.resendText}>Resend code in 1:52 mins</Text>
        <PrimaryButton 
          title="Sign In" 
          variant="solid" 
          onPress={handleSignIn} 
          isLoading={isLoading}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    paddingBottom: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logoText: {
    color: COLORS.primaryDark,
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.textMain,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.regular,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl, // Extra padding for Pixel 8 Pro bottom swipe bar
    alignItems: 'center',
  },
  resendText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
});