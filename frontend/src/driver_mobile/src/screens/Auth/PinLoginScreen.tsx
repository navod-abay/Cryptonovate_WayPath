import React, { useEffect, useState } from 'react';
import { View, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import CustomText from '../../components/CustomText';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import OTPInput from '../../components/OTPInput';
import SelectableChip from '../../components/SelectableChip';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DEPOTS, Depot, getSavedDepot, pinLogin } from '../../api/auth';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PinLogin'>;
};

const PIN_LENGTH = 4;

/**
 * Drivers sign in like loaders: their own 4-digit PIN, checked against the drivers of the depot the
 * phone is set to (remembered after the first sign-in). The account belongs to one vehicle.
 */
export default function PinLoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [depot, setDepot] = useState<Depot>('Peliyagoda');
  const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(''));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSavedDepot().then((saved) => saved && setDepot(saved));
  }, []);

  const complete = pin.every((d) => /^\d$/.test(d));

  const handleSignIn = async () => {
    if (!complete) return;
    setIsLoading(true);
    setError('');
    try {
      await pinLogin(depot, pin.join(''));
      navigation.reset({ index: 0, routes: [{ name: 'Dashboard' }] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
      setPin(Array(PIN_LENGTH).fill(''));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Header Section */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.xl }]}>
        <CustomText style={styles.logoText}>Waypoint Logistics</CustomText>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        <CustomText style={styles.label}>Depot</CustomText>
        <View style={styles.depots}>
          {DEPOTS.map((d) => (
            <SelectableChip key={d} title={d} isSelected={depot === d} onPress={() => setDepot(d)} />
          ))}
        </View>

        <CustomText style={styles.title}>Enter your PIN</CustomText>
        <CustomText style={styles.subtitle}>Your PIN signs you in to your vehicle</CustomText>

        <OTPInput code={pin} setCode={setPin} length={PIN_LENGTH} secure />

        {!!error && <CustomText style={styles.error}>{error}</CustomText>}
      </View>

      {/* Footer Section */}
      <View style={styles.footer}>
        <PrimaryButton
          title="Sign In"
          variant="solid"
          onPress={handleSignIn}
          isLoading={isLoading}
          disabled={!complete || isLoading}
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
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  depots: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
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
  error: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  footer: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl, // Extra padding for Pixel 8 Pro bottom swipe bar
    alignItems: 'center',
  },
});
