import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type ViewProps } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { colors, radius, shadows } from '@/constants/brand';
import { statusLabel } from '@/lib/format';
import type { TransactionStatus } from '@/types/models';

export function ScreenTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <View style={styles.heading}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>;
}

export function Card({ children, style, ...props }: ViewProps) {
  return <View {...props} style={[styles.card, style]}>{children}</View>;
}

type ButtonProps = PressableProps & { label: string; icon?: SymbolViewProps['name']; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean };
export function Button({ label, icon, variant = 'primary', busy, disabled, style, ...props }: ButtonProps) {
  return <Pressable
    accessibilityRole="button"
    disabled={disabled || busy}
    {...props}
    style={({ pressed }) => [styles.button, styles[`button_${variant}`], (disabled || busy) && styles.disabled, pressed && styles.pressed, typeof style === 'function' ? style({ pressed }) : style]}
  >
    {busy ? <ActivityIndicator color={variant === 'primary' ? colors.background : colors.ink} /> : icon ? <SymbolView name={icon} size={18} tintColor={variant === 'primary' ? colors.background : variant === 'danger' ? colors.danger : colors.ink} /> : null}
    <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
  </Pressable>;
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  return <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.teal}
      {...props}
      style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
    />
    {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>;
}

export function Choice<T extends string>({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void; value?: T }) {
  return <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
  </Pressable>;
}

export function StatusPill({ status }: { status: TransactionStatus }) {
  const warning = status === 'DISPUTED';
  const done = status === 'COMPLETED' || status === 'ARCHIVED';
  return <View style={[styles.pill, warning && styles.pillWarning, done && styles.pillDone]}>
    <View style={[styles.dot, warning && { backgroundColor: colors.danger }, done && { backgroundColor: colors.teal }]} />
    <Text style={[styles.pillText, warning && { color: colors.danger }, done && { color: colors.teal }]}>{statusLabel[status]}</Text>
  </View>;
}

export function ProgressBar({ value }: { value: number }) {
  return <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} /></View>;
}

export function EmptyState({ icon = 'shippingbox', title, body, action }: { icon?: SymbolViewProps['name']; title: string; body: string; action?: React.ReactNode }) {
  return <View style={styles.empty}>
    <View style={styles.iconCircle}><SymbolView name={icon} size={32} tintColor={colors.teal} /></View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptyBody}>{body}</Text>
    {action}
  </View>;
}

export function LoadingScreen() {
  return <View style={styles.loading}><View style={styles.shield}><Text style={styles.shieldText}>P</Text></View><ActivityIndicator color={colors.teal} size="large" /></View>;
}

const styles = StyleSheet.create({
  heading: { gap: 7, marginBottom: 22 },
  eyebrow: { color: colors.teal, fontWeight: '800', fontSize: 11, letterSpacing: 1.8 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 31, letterSpacing: -0.8 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 560 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 18, ...shadows.card },
  button: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1 },
  button_primary: { backgroundColor: colors.teal, borderColor: colors.teal },
  button_secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
  button_ghost: { backgroundColor: 'transparent', borderColor: colors.border },
  button_danger: { backgroundColor: 'rgba(255,107,118,0.08)', borderColor: 'rgba(255,107,118,0.4)' },
  buttonText: { fontWeight: '800', fontSize: 15 },
  buttonText_primary: { color: colors.background },
  buttonText_secondary: { color: colors.ink },
  buttonText_ghost: { color: colors.ink },
  buttonText_danger: { color: colors.danger },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  fieldWrap: { gap: 8 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.ink, fontSize: 15 },
  inputMultiline: { minHeight: 108, paddingTop: 14, textAlignVertical: 'top' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.danger, fontSize: 12 },
  choice: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surfaceRaised },
  choiceSelected: { borderColor: colors.teal, backgroundColor: 'rgba(33,212,180,0.11)' },
  choiceText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  choiceTextSelected: { color: colors.teal },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(104,169,255,0.09)', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  pillWarning: { backgroundColor: 'rgba(255,107,118,0.09)' },
  pillDone: { backgroundColor: 'rgba(33,212,180,0.09)' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.blue },
  pillText: { color: colors.blue, fontWeight: '800', fontSize: 11 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: colors.teal },
  empty: { paddingVertical: 46, paddingHorizontal: 24, alignItems: 'center', gap: 12 },
  iconCircle: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(33,212,180,0.09)', borderWidth: 1, borderColor: 'rgba(33,212,180,0.25)' },
  emptyTitle: { color: colors.ink, fontSize: 19, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340, marginBottom: 6 },
  loading: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 24 },
  shield: { width: 72, height: 82, borderWidth: 2, borderColor: colors.teal, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(33,212,180,0.08)' },
  shieldText: { color: colors.teal, fontSize: 33, fontWeight: '900' },
});
