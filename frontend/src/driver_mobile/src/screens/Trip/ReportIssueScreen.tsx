import React, { useState } from 'react';
import {View, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert} from 'react-native';
import CustomText from '../../components/CustomText';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale, FONT_FAMILY } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import SelectableCard from '../../components/SelectableCard';
import SelectableChip from '../../components/SelectableChip';
import Ionicons from 'react-native-vector-icons/Ionicons';
import SimpleLineIcons from 'react-native-vector-icons/SimpleLineIcons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Fontisto from 'react-native-vector-icons/Fontisto';
import AntDesign from 'react-native-vector-icons/AntDesign';
import { launchCamera, CameraOptions } from 'react-native-image-picker';
import { reportIncident, type IncidentIssue } from '../../services/IncidentReports';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ReportIssue'>;
  route: RouteProp<RootStackParamList, 'ReportIssue'>;
};

export default function ReportIssueScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { tripId, nodeId, nodeTitle, outletId, onReportSubmitted } = route.params;

  // Form State
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  const handleCapturePhoto = async () => {
    const options: CameraOptions = {
      mediaType: 'photo',
      cameraType: 'back',
      saveToPhotos: true,
      quality: 0.5,
    };
    
    launchCamera(options, (response) => {
      if (response.didCancel) return;
      if (response.errorMessage) {
        console.error('Camera Error: ', response.errorMessage);
        return;
      }
      
      const fileName = response.assets?.[0]?.fileName || `photo_${Date.now()}.jpg`;
      setPhotos(prev => [...prev, fileName]);
    });
  };

  const issues = [
    { id: 'no_receive', title: 'No one to receive', icon: <Ionicons name="person-remove-outline" size={scale(24)} color={COLORS.textMain} /> },
    { id: 'closed', title: 'Outlet closed', icon: <SimpleLineIcons name="lock" size={scale(24)} color={COLORS.textMain} /> },
    { id: 'refused', title: 'Refused items', icon: <MaterialIcons name="not-interested" size={scale(24)} color={COLORS.textMain} /> },
    { id: 'blocked', title: 'Road access blocked', icon: <Fontisto name="rain" size={scale(24)} color={COLORS.textMain} /> },
  ];

  const actionsMap: Record<string, { id: string, title: string }[]> = {
    no_receive: [
      { id: 'waited', title: 'Waited 15 minutes' },
      { id: 'called', title: 'Called the manager' }
    ],
    closed: [
      { id: 'alt_route', title: 'Took an alternative route' },
      { id: 'skipped', title: 'Skipped the outlet' }
    ],
    refused: [
      { id: 'partial', title: 'Partial unload' },
      { id: 'returned', title: 'Returned all items' }
    ],
    blocked: [
      { id: 'alt_route', title: 'Took an alternative route' },
      { id: 'skipped', title: 'Skipped the outlet' },
      { id: 'wait_clear', title: 'Waited for clearance' }
    ]
  };

  const actions = selectedIssue ? actionsMap[selectedIssue] : [];

  const handleSendReport = async () => {
    if (!selectedIssue) return;
    setIsSubmitting(true);
    // Saved on the phone first, so a report made without signal is sent once the network is back.
    // Photos are not sent yet.
    const result = await reportIncident({
      tripId,
      stopId: nodeId,
      outletId,
      issue: selectedIssue as IncidentIssue,
      action: selectedAction ?? undefined,
      notes: notes.trim() || undefined,
    }).catch(() => 'queued' as const);
    setIsSubmitting(false);
    onReportSubmitted(); // Updates the flag on the ActiveTripScreen
    if (result === 'queued') {
      Alert.alert('Report saved', 'No connection right now. It will be sent to the dispatcher automatically.');
    }
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <AntDesign name="arrowleft" style={styles.backArrow} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <CustomText style={styles.headerTitle}>Report Issue</CustomText>
          <CustomText style={styles.headerSubtitle}>{tripId} - {nodeTitle}</CustomText>
        </View>
        <View style={styles.backButton} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          
          {/* SECTION 1: What's Wrong? */}
          <CustomText style={styles.sectionTitle}>What's Wrong ?</CustomText>
          <View style={styles.gridContainer}>
            {issues.map((issue) => (
              <SelectableCard
                key={issue.id}
                title={issue.title}
                icon={issue.icon}
                isSelected={selectedIssue === issue.id}
                onPress={() => {
                  setSelectedIssue(issue.id);
                  setSelectedAction(null); // reset action when issue changes
                }}
              />
            ))}
          </View>

          {/* SECTION 2: Actions Taken */}
          <CustomText style={styles.sectionTitle}>Did you take any of these actions?</CustomText>
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

          {/* Render Attached Photos */}
          {photos.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: SPACING.md, marginTop: SPACING.md, gap: SPACING.sm }}>
              {photos.map((photo, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.badgeCyan, paddingHorizontal: SPACING.md, paddingVertical: scale(6), borderRadius: scale(16) }}>
                  <CustomText style={{ color: COLORS.primaryDark, fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.bold, marginRight: SPACING.sm }}>{photo}</CustomText>
                  <TouchableOpacity onPress={() => setPhotos(photos.filter((_, i) => i !== idx))}>
                    <CustomText style={{ color: COLORS.primaryDark, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold }}>✕</CustomText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Spacer to push buttons up above keyboard if needed */}
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* FOOTER BUTTONS */}
      <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.lg }]}>
        <TouchableOpacity style={styles.addPhotoBtn} onPress={handleCapturePhoto}>
           <Ionicons name="camera-outline" style={styles.addPhotoIcon} />
          <CustomText style={styles.addPhotoText}>Add Photo (Optional)</CustomText>
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
  sectionTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.regular,
    color: COLORS.textMain, fontWeight: FONT_WEIGHT.medium, textAlign: 'center', marginBottom: SPACING.lg, marginTop: SPACING.sm },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  chipsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginBottom: SPACING.lg },
  
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: scale(8),
    padding: SPACING.md,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.regular,
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