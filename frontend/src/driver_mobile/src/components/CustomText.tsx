import React, { forwardRef } from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { FONT_FAMILY } from '../utils/constants';

const CustomText = forwardRef<RNText, TextProps>((props, ref) => {
  const { style, ...rest } = props;
  
  const flatStyle = StyleSheet.flatten(style) || {};
  let fontFamily = FONT_FAMILY.regular;

  if (flatStyle.fontWeight) {
    switch (flatStyle.fontWeight) {
      case 'bold':
      case '700':
      case '800':
      case '900':
        fontFamily = FONT_FAMILY.bold;
        break;
      case '600':
        fontFamily = FONT_FAMILY.semibold;
        break;
      case '500':
        fontFamily = FONT_FAMILY.medium;
        break;
      case '400':
      case 'normal':
      default:
        fontFamily = FONT_FAMILY.regular;
        break;
    }
  }

  const { fontWeight, ...styleWithoutWeight } = flatStyle;

  return <RNText style={[{ fontFamily }, styleWithoutWeight]} ref={ref} {...rest} />;
});

export default CustomText;
