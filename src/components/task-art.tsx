import { StyleSheet, View } from 'react-native';
import { AppIcon } from '@/components/app-icon';
import { colors } from '@/constants/brand';

export type TaskArtKind = 'box' | 'check' | 'phone' | 'share' | 'label';

export function TaskArt({ kind }: { kind: TaskArtKind }) {
  return (
    <View style={styles.stage} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {kind === 'check' ? <CheckArt /> : null}
      {kind === 'box' ? <BoxArt /> : null}
      {kind === 'phone' ? <PhoneArt /> : null}
      {kind === 'share' ? <ShareArt /> : null}
      {kind === 'label' ? <LabelArt /> : null}
    </View>
  );
}

function CheckArt() {
  return (
    <View style={styles.checkCircle}>
      <AppIcon name="checkmark.circle.fill" size={44} tintColor={colors.white} />
    </View>
  );
}

function ShareArt() {
  return (
    <View style={styles.shareCircle}>
      <AppIcon name="square.and.arrow.up" size={36} tintColor={colors.teal} />
    </View>
  );
}

function BoxArt() {
  return (
    <View style={styles.boxWrap}>
      <View style={styles.boxLid} />
      <View style={styles.boxBody} />
    </View>
  );
}

function PhoneArt() {
  return (
    <View style={styles.phoneScene}>
      <View style={styles.table} />
      <View style={styles.phone}>
        <View style={styles.phoneScreen} />
      </View>
    </View>
  );
}

function LabelArt() {
  return (
    <View style={styles.labelBox}>
      <View style={styles.labelStrip} />
      <View style={styles.markLine} />
    </View>
  );
}

export function SealGuideOverlay() {
  return (
    <View pointerEvents="none" style={styles.sealOverlay}>
      <View style={styles.sealBox}>
        <View style={styles.sealLabel} />
        <View style={styles.sealMark} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { minHeight: 168, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCircle: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: 'rgba(70,124,99,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxWrap: { width: 148, alignItems: 'center' },
  boxLid: {
    width: 132,
    height: 18,
    borderRadius: 6,
    backgroundColor: colors.teal,
    marginBottom: 6,
  },
  boxBody: {
    width: 148,
    height: 88,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.teal,
  },
  phoneScene: { width: 180, height: 150, alignItems: 'center', justifyContent: 'flex-end' },
  table: {
    position: 'absolute',
    bottom: 18,
    width: 180,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  phone: {
    width: 52,
    height: 96,
    borderRadius: 10,
    backgroundColor: colors.ink,
    padding: 5,
    marginBottom: 22,
  },
  phoneScreen: { flex: 1, borderRadius: 6, backgroundColor: colors.teal },
  labelBox: {
    width: 168,
    height: 112,
    borderRadius: 12,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.teal,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  labelStrip: {
    marginHorizontal: 16,
    height: 36,
    borderRadius: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  markLine: {
    position: 'absolute',
    left: -10,
    right: -10,
    height: 4,
    backgroundColor: colors.ink,
    transform: [{ rotate: '-18deg' }],
  },
  sealOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  sealBox: {
    width: '78%',
    maxWidth: 320,
    aspectRatio: 4 / 3,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  sealLabel: {
    marginHorizontal: '10%',
    height: '28%',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  sealMark: {
    position: 'absolute',
    left: '-8%',
    right: '-8%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    transform: [{ rotate: '-16deg' }],
  },
});
