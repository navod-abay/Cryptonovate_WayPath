import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import SelectableCard from '../../components/SelectableCard';
import SelectableChip from '../../components/SelectableChip';
import Ionicons from 'react-native-vector-icons/Ionicons';
import SimpleLineIcons from 'react-native-vector-icons/SimpleLineIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Fontisto from 'react-native-vector-icons/Fontisto';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ReportIssue'>;
  route: RouteProp<RootStackParamList, 'ReportIssue'>;
};

export default function ReportIssueScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { tripId, nodeId, nodeTitle, onReportSubmitted } = route.params;

  // Form State
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const issues = [
    { id: 'no_receive', title: 'No one to receive', icon: <Ionicons name="person-remove-outline" size={scale(24)} color={COLORS.textMain} /> },
    { id: 'closed', title: 'Outlet closed', icon: <SimpleLineIcons name="lock" size={scale(24)} color={COLORS.textMain} /> },
    { id: 'refused', title: 'Refused items', icon: <MaterialIcons name="not-interested" size={scale(24)} color={COLORS.textMain} /> },
    { id: 'blocked', title: 'Road access blocked', icon: <Fontisto name="rain" size={scale(24)} color={COLORS.textMain} /> },
  ];

  const actions = [
    { id: 'alt_route', title: 'Took an alternative route' },
    { id: 'skipped', title: 'Skipped the outlet' },
  ];

  const handleSendReport = () => {
    setIsSubmitting(true);
    // Simulate API payload submission to backend
    const payload = { tripId, nodeId, issue: selectedIssue, action: selectedAction, notes };
    console.log('Sending Report:', payload);

    setTimeout(() => {
      setIsSubmitting(false);
      onReportSubmitted(); // Updates the flag on the ActiveTripScreen
      navigation.goBack();
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backArrow}>{'<-'}</Text>
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Report Issue</Text>
          <Text style={styles.headerSubtitle}>{tripId} - {nodeTitle}</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* SECTION 1: What's Wrong? */}
          <Text style={styles.sectionTitle}>What's Wrong ?</Text>
          <View style={styles.gridContainer}>
            {issues.map((issue) => (
              <SelectableCard
                key={issue.id}
                title={issue.title}
                icon={issue.icon}
                isSelected={selectedIssue === issue.id}
                onPress={() => setSelectedIssue(issue.id)}
              />
            ))}
          </View>

          {/* SECTION 2: Actions Taken */}
          <Text style={styles.sectionTitle}>Did you take any of these actions?</Text>
          <View style={styles.chipsContainer}>
            {actions.map((action) => (
              <SelectableChip
                key={action.id}
                title={action.title}
                isSelected={selectedAction === action.id}
                onPress={() => setSelectedAction(action.id)}
              />
            ))}
          </View>

          {/* SECTION 3: Notes */}
          <TextInput
            style={styles.textInput}
            placeholder="Additional notes here"
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
          />

          {/* Spacer to push buttons up above keyboard if needed */}
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* FOOTER BUTTONS */}
      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.lg }]}>
        <TouchableOpacity style={styles.addPhotoBtn}>
           <Ionicons name="camera-outline" style={styles.addPhotoIcon} />
          <Text style={styles.addPhotoText}>Add Photo (Optional)</Text>
        </TouchableOpacity>
        
        <PrimaryButton 
          title="Send Report" 
          onPress={handleSendReport} 
          isLoading={isSubmitting}
          disabled={!selectedIssue} // Prevent sending empty reports
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { 
    backgroundColor: COLORS.primaryDark, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: SPACING.md, 
    paddingBottom: SPACING.md 
  },
  backButton: { width: scale(40) },
  backArrow: { color: COLORS.surface, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  headerTitles: { alignItems: 'center' },
  headerTitle: { color: COLORS.surface, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  headerSubtitle: { color: COLORS.surface, fontSize: scale(12), marginTop: scale(2), opacity: 0.9 },
  
  content: { flex: 1, padding: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.md, color: COLORS.textMain, fontWeight: FONT_WEIGHT.medium, textAlign: 'center', marginBottom: SPACING.lg, marginTop: SPACING.sm },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: SPACING.lg },
  
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    padding: SPACING.md,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMain,
    minHeight: scale(100),
    textAlignVertical: 'top',
    backgroundColor: COLORS.background,
  },
  
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, backgroundColor: COLORS.surface },
  addPhotoBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed', // Dashed border for the photo button[cite: 11]
    borderRadius: scale(8),
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },
  addPhotoIcon: { fontSize: FONT_SIZE.md, marginRight: SPACING.sm, color: COLORS.textSecondary },
  addPhotoText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: FONT_WEIGHT.medium },
});