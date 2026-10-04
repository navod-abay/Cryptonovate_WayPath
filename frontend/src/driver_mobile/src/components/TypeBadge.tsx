import React from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Feather from 'react-native-vector-icons/Feather';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { scale } from '../utils/constants';

interface Props {
  type?: 'chilled' | 'dry' | 'tech' | 'style' | string;
}

export default function TypeBadge({ type = 'dry' }: Props) {
  const normalizedType = type.toLowerCase();

  let iconConfig = {
    bg: '#E2F8FD',
    iconBg: '#94E5F9',
    color: '#004A61',
    icon: <Feather name="box" size={scale(16)} color="#004A61" />,
    text: 'Unknown'
  };

  switch (normalizedType) {
    case 'chilled':
      iconConfig = {
        bg: '#E5F8FA', // very light blue
        iconBg: '#78E0F9', // light blue
        color: '#004466', // dark blue
        icon: <Ionicons name="snow-outline" size={scale(16)} color="#004466" />,
        text: 'Chilled'
      };
      break;
    case 'dry':
      iconConfig = {
        bg: '#FFFBE6', // very light yellow
        iconBg: '#FBE482', // yellow
        color: '#5C4000', // dark amber
        icon: <MaterialCommunityIcons name="food-drumstick-outline" size={scale(16)} color="#5C4000" />,
        text: 'Dry'
      };
      break;
    case 'tech':
      iconConfig = {
        bg: '#EEFCF4', // very light green
        iconBg: '#B5F5CD', // light green
        color: '#004466',
        icon: <Ionicons name="game-controller-outline" size={scale(16)} color="#004466" />,
        text: 'Tech'
      };
      break;
    case 'style':
      iconConfig = {
        bg: '#FFF2F5', // very light pink
        iconBg: '#FFC2CF', // pink
        color: '#004466',
        icon: <Ionicons name="shirt-outline" size={scale(16)} color="#004466" />,
        text: 'Style'
      };
      break;
  }

  return (
    <View style={[styles.iconBox, { backgroundColor: iconConfig.iconBg }]}>
      {iconConfig.icon}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
});
