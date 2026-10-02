import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../../navigation/AppNavigator';
import { COLORS, SPACING, FONT_SIZE, FONT_WEIGHT, scale } from '../../utils/constants';
import PrimaryButton from '../../components/PrimaryButton';
import Badge from '../../components/Badge';
import ItemsListModal from '../../components/ItemsListModal';
import DeliveryConfirmationModal from '../../components/DeliveryConfirmationModal';
import { TripNode, TripLog } from '../../types/trip';
import Feather from 'react-native-vector-icons/Feather';
import CarrotIcon from '../../components/CarrotIcon';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import AntDesign from 'react-native-vector-icons/AntDesign';


type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ActiveTrip'>;
  route: RouteProp<RootStackParamList, 'ActiveTrip'>;
};

export default function ActiveTripScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  
  // Data passed from Dashboard
  const { tripData, initialIndex = 0 } = route.params;
  const [nodes, setNodes] = useState<TripNode[]>(tripData.nodes);
  const [isStarted, setIsStarted] = useState(tripData.isStarted);
  
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const currentNode = nodes[currentIndex];
  const isWarehouse = currentNode.type === 'warehouse';
  
  // Modal States
  const [itemsVisible, setItemsVisible] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);

  // Status computation
  const totalOutlets = nodes.filter(n => n.type === 'outlet').length;
  const currentOutletIndex = nodes.slice(0, currentIndex + 1).filter(n => n.type === 'outlet').length;

  // --- API Simulation Functions --- //
  
  const updateNodeState = (status: TripNode['status'], newLog?: TripLog) => {
    const updatedNodes = [...nodes];
    updatedNodes[currentIndex].status = status;
    if (newLog) updatedNodes[currentIndex].logs.push(newLog);
    setNodes(updatedNodes);
  };

  const handleArrival = () => {
    updateNodeState('arrived', { action: 'Arrival', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
    
    // Simulate loading/unloading confirmation for BOTH warehouse and outlets after 3 seconds
    setTimeout(() => updateNodeState('ready_to_depart'), 3000);
  };

  const handleOTPConfirm = (code: string) => {
    console.log(`Verifying OTP ${code} with Port 5001 Auth Service...`);
    setOtpVisible(false);
    updateNodeState('completed', { action: 'Departure', time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) });
  };

  const handleFlagPress = () => {
    navigation.navigate('ReportIssue', {
      tripId: tripData.activeTripId,
      nodeId: currentNode.id,
      nodeTitle: currentNode.title,
      onReportSubmitted: () => {
        // Increment the report count when the modal closes successfully
        const updatedNodes = [...nodes];
        updatedNodes[currentIndex].reportCount = (updatedNodes[currentIndex].reportCount || 0) + 1;
        setNodes(updatedNodes);
      }
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      
      {/* 1. TOP HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.md }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
           <AntDesign name="arrowleft" style={styles.backArrow} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tripData.activeTripId}</Text>
        <View style={styles.backButton} />
      </View>

      {/* DYNAMIC STATUS BANNERS */}
      {isStarted && currentNode.status === 'arrived' && (
        <View style={[styles.banner, { backgroundColor: COLORS.success }]}>
          <Text style={styles.bannerText}>
            {isWarehouse ? '1 hr 04 mins in Warehouse' : 'Arrived at Outlet'}
          </Text>
        </View>
      )}
      {isStarted && currentNode.status === 'ready_to_depart' && (
        <View style={[styles.banner, { backgroundColor: COLORS.danger }]}>
          <Text style={styles.bannerText}>Departure in 3 mins</Text>
        </View>
      )}

      {/* 2. PAGINATOR */}
      <View style={styles.paginator}>
        <TouchableOpacity onPress={() => setCurrentIndex(prev => prev - 1)} disabled={currentIndex === 0} style={styles.arrowButton}>
          <AntDesign name="left" style={[styles.arrowText, currentIndex === 0 && styles.arrowDisabled]} />
        </TouchableOpacity>
        
        <View style={styles.paginatorCenter}>
          <Text style={styles.paginatorTitle}>{isWarehouse ? 'Warehouse' : 'Outlet'}</Text>
          <Text style={styles.paginatorSubtitle}>{isWarehouse ? `${totalOutlets} outlets` : `${currentOutletIndex} of ${totalOutlets}`}</Text>
        </View>

        <TouchableOpacity onPress={() => setCurrentIndex(prev => prev + 1)} disabled={currentIndex === nodes.length - 1} style={styles.arrowButton}>
          <AntDesign name="right" style={[styles.arrowText, currentIndex === nodes.length - 1 && styles.arrowDisabled]} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        
        {/* Title & Status Icon Row */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            <Text style={styles.nodeTitle}>{currentNode.title}</Text>
          </View>
          
          {currentNode.status === 'completed' ? (
            <View style={styles.checkCircle}>
              <Text style={styles.checkIcon}>✓</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={handleFlagPress} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Conditionally render the report count if greater than 0[cite: 11] */}
              {(currentNode.reportCount ?? 0) > 0 && (
                <Text style={{ color: COLORS.danger, fontSize: FONT_SIZE.sm, marginRight: scale(4), textDecorationLine: 'underline' }}>
                  {currentNode.reportCount} Report
                </Text>
              )}
              <Feather name="flag" color={COLORS.danger} size={scale(20)} />
            </TouchableOpacity>
          )}
        </View>

        {/* Badges Row */}
        <View style={styles.badgeRow}>
          <Badge label={currentNode.badgeText} backgroundColor={COLORS.badgeCyan} />
          <View style={{ width: SPACING.sm }} />
          <Badge backgroundColor={COLORS.badgeYellow} 
          icon={<CarrotIcon width={scale(14)} height={scale(14)} color={COLORS.iconYellow} />} /> 
        </View>

        {/* Dynamic Time Section */}
        {isWarehouse ? (
          <View style={styles.timeBlocksContainer}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeBlockLabel}>Arrive</Text>
              <Text style={[styles.timeBlockValue, { color: COLORS.primaryDark }]}>{currentNode.scheduledStart}</Text>
            </View>
            <View style={styles.timeBlock}>
              <Text style={styles.timeBlockLabel}>Depart</Text>
              <Text style={[styles.timeBlockValue, { color: COLORS.danger }]}>{currentNode.scheduledEnd}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.outletTimeWindow}>{currentNode.scheduledStart} - {currentNode.scheduledEnd}</Text>
        )}

        {/* View Items Link */}
        <TouchableOpacity style={styles.itemsLinkRow} onPress={() => setItemsVisible(true)}>
          <FontAwesome name="list-alt" style={styles.itemsIcon} />
          <Text style={styles.itemsText}>View Items List</Text>
        </TouchableOpacity>

        {/* Activity Logs (Arrival / Departure Timestamps) */}
        <View style={styles.logsContainer}>
          {currentNode.logs?.map((log, index) => (
            <View key={index} style={styles.logRow}>
              <Text style={styles.logTime}>{log.time}</Text>
              <Text style={styles.logAction}>{log.action}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 4. FIXED BOTTOM BUTTONS */}
     <View style={[styles.footer, { paddingBottom: insets.bottom || SPACING.lg }]}>
        <PrimaryButton 
          title="Open in Maps" 
          variant="outline" 
          onPress={() => {}} 
          style={{ marginBottom: SPACING.md }} 
          iconRight={<Feather name="navigation" size={scale(18)} color={COLORS.primaryDark} />}
        />
        
        {/* Dynamic Action Button Logic */}
        {currentNode.status === 'pending' ? (
          <PrimaryButton 
            title="I've Arrived !" 
            disabled={!isStarted || (currentIndex !== 0 && nodes[currentIndex - 1].status !== 'completed')} 
            onPress={handleArrival} 
          />
        ) : currentNode.status === 'completed' ? (
           <PrimaryButton title="Completed" disabled={true} onPress={() => {}} />
        ) : (
          <PrimaryButton 
            title="Depart Now" 
            disabled={currentNode.status === 'arrived'} // Disabled for both warehouse and outlets until the 3-second loader finishes
            onPress={() => setOtpVisible(true)} 
          />
        )}
      </View>

      {/* Overlay Modals */}
      <ItemsListModal visible={itemsVisible} onClose={() => setItemsVisible(false)} items={currentNode.inventory} />
      <DeliveryConfirmationModal visible={otpVisible} onClose={() => setOtpVisible(false)} onConfirm={handleOTPConfirm} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  header: { backgroundColor: COLORS.primaryDark, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  backButton: { width: scale(40) },
  backArrow: { color: COLORS.surface, fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  headerTitle: { color: COLORS.surface, fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  
  banner: { paddingVertical: scale(6), alignItems: 'center' },
  bannerText: { color: COLORS.surface, fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.sm },

  paginator: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  arrowButton: { padding: SPACING.md },
  arrowText: { fontSize: FONT_SIZE.xl, color: COLORS.textSecondary },
  arrowDisabled: { opacity: 0.2 },
  paginatorCenter: { alignItems: 'center' },
  paginatorTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  paginatorSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginTop: scale(2) },
  
  content: { flex: 1, padding: SPACING.lg },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  titleLeft: { flexDirection: 'row', alignItems: 'flex-end' },
  nodeTitle: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  
  flagIcon: { fontSize: FONT_SIZE.xl, color: COLORS.danger },
  checkCircle: { width: scale(32), height: scale(32), borderRadius: scale(16), backgroundColor: COLORS.success, justifyContent: 'center', alignItems: 'center' },
  checkIcon: { color: COLORS.surface, fontWeight: FONT_WEIGHT.bold, fontSize: FONT_SIZE.lg },
  
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  
  timeBlocksContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.lg },
  timeBlock: { flex: 1, backgroundColor: COLORS.background, borderRadius: scale(8), padding: SPACING.md, marginRight: SPACING.sm },
  timeBlockLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: scale(4) },
  timeBlockValue: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold },
  outletTimeWindow: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain, marginBottom: SPACING.lg },
  
  itemsLinkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xl },
  itemsIcon: { fontSize: FONT_SIZE.lg, marginRight: SPACING.sm, color: COLORS.badgeCyan },
  itemsText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.badgeCyan, textDecorationLine: 'underline' },
  
  logsContainer: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.md },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: scale(8), borderBottomWidth: 1, borderBottomColor: COLORS.background },
  logTime: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold, color: COLORS.textMain },
  logAction: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },

  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
});