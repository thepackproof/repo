import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

const iconSource = require('../../assets/brand/packproof-icon-v2.png');
const wordmarkSource = require('../../assets/brand/packproof-wordmark-v2.png');

export function BrandIcon({ style }: { style?: StyleProp<ImageStyle> }) {
  return <Image accessibilityLabel="PackProof" resizeMode="contain" source={iconSource} style={[styles.icon, style]} />;
}

export function BrandLockup({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.lockup, style]}>
    <Image accessibilityLabel="PackProof — Evidence infrastructure · cryptographic seal" resizeMode="cover" source={wordmarkSource} style={styles.wordmark} />
  </View>;
}

const styles = StyleSheet.create({
  icon: { width: 88, height: 88 },
  lockup: { width: '100%', maxWidth: 360, height: 126, overflow: 'hidden' },
  wordmark: { width: '100%', height: '100%' },
});
