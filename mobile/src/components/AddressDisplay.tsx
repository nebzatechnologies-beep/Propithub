import React from 'react';
import { View, Text, TouchableOpacity, Linking, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { getCleanAddressText } from '../lib/addressUtils';

interface AddressDisplayProps {
  address?: any;
  fallback?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  showMapLink?: boolean;
}

export const AddressDisplay: React.FC<AddressDisplayProps> = ({
  address,
  fallback = 'Address on file',
  style,
  textStyle,
  linkStyle,
  numberOfLines,
  showMapLink = true,
}) => {
  const { text, mapUrl } = getCleanAddressText(address, fallback);
  const hasText = Boolean(text && text !== fallback);

  if (mapUrl && showMapLink) {
    return (
      <View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }, style]}>
        {hasText && (
          <Text style={textStyle} numberOfLines={numberOfLines}>
            {text}
          </Text>
        )}
        {hasText && <Text style={[textStyle, { opacity: 0.6 }]}>•</Text>}
        <TouchableOpacity onPress={() => Linking.openURL(mapUrl)} activeOpacity={0.7}>
          <Text
            style={[
              {
                fontSize: 12,
                color: '#0d9488',
                fontWeight: '600',
                textDecorationLine: 'underline',
              },
              linkStyle,
            ]}
          >
            View on Google Maps ↗
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Text style={textStyle} numberOfLines={numberOfLines}>
      {text}
    </Text>
  );
};

