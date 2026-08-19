import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { Button } from '@/components/ui';
import { colors } from '@/constants/brand';

export type TaskCta = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: AppIconName;
};

export function TaskSession({
  identity,
  art,
  title,
  sentence,
  children,
  primary,
  secondary,
  progress,
  onClose,
  closeLabel = 'Close',
  align = 'center',
}: {
  identity?: string;
  art?: ReactNode;
  title: string;
  sentence?: string;
  children?: ReactNode;
  primary?: TaskCta | null;
  secondary?: { label: string; onPress: () => void } | null;
  progress?: number | null;
  onClose?: () => void;
  closeLabel?: string;
  align?: 'center' | 'start';
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.chrome}>
          {onClose ? (
            <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel={closeLabel}>
              <Text style={styles.closeText}>{closeLabel}</Text>
            </Pressable>
          ) : <View style={styles.close} />}
          {progress != null ? (
            <View style={styles.progressTrack} accessibilityElementsHidden>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
            </View>
          ) : null}
        </View>
        <ScrollView contentContainerStyle={[styles.body, align === 'start' && styles.bodyStart]} keyboardShouldPersistTaps="handled">
          {identity ? <Text style={styles.identity}>{identity}</Text> : null}
          {art ? <View style={styles.art}>{art}</View> : null}
          <Text style={styles.title}>{title}</Text>
          {sentence ? <Text style={styles.sentence}>{sentence}</Text> : null}
          {children}
        </ScrollView>
        {primary || secondary ? (
          <View style={styles.footer}>
            {primary ? (
              <Button
                label={primary.label}
                icon={primary.icon}
                busy={primary.busy}
                disabled={primary.disabled}
                onPress={primary.onPress}
              />
            ) : null}
            {secondary ? <Button label={secondary.label} variant="ghost" onPress={secondary.onPress} /> : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function HomeTaskTile({
  identity,
  title,
  job,
  cta,
  onPress,
  onCta,
}: {
  identity?: string;
  title: string;
  job: string;
  cta?: string | null;
  onPress: () => void;
  onCta?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tile} accessibilityRole="button">
      {identity ? <Text style={styles.tileIdentity}>{identity}</Text> : null}
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileJob}>{job}</Text>
      {cta ? (
        <Button label={cta} onPress={onCta ?? onPress} />
      ) : null}
    </Pressable>
  );
}

export function HomeWaitTile({
  title,
  sentence,
  onPress,
}: {
  title: string;
  sentence: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.waitTile} accessibilityRole="button">
      <AppIcon name="checkmark.circle.fill" size={22} tintColor={colors.teal} />
      <View style={styles.waitCopy}>
        <Text style={styles.waitTitle}>{title}</Text>
        <Text style={styles.waitSentence}>{sentence}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  chrome: { paddingHorizontal: 20, paddingTop: 4, minHeight: 44, justifyContent: 'center' },
  close: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingRight: 12 },
  closeText: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  progressTrack: { height: 3, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: colors.teal },
  body: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, gap: 14, justifyContent: 'center' },
  bodyStart: { justifyContent: 'flex-start', paddingTop: 20 },
  identity: { color: colors.muted, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  art: { alignItems: 'center', marginVertical: 8 },
  title: { color: colors.ink, fontSize: 34, lineHeight: 40, letterSpacing: -0.8, fontWeight: '800', textAlign: 'center' },
  sentence: { color: colors.muted, fontSize: 17, lineHeight: 24, textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingBottom: 18, paddingTop: 8, gap: 8 },
  tile: { backgroundColor: colors.white, borderRadius: 24, padding: 22, gap: 10 },
  tileIdentity: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  tileTitle: { color: colors.ink, fontSize: 26, lineHeight: 31, fontWeight: '800' },
  tileJob: { color: colors.ink, fontSize: 17, lineHeight: 23, fontWeight: '600', marginBottom: 6 },
  waitTile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 4 },
  waitCopy: { flex: 1, gap: 3 },
  waitTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  waitSentence: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
