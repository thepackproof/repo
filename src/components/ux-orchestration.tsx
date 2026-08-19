import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '@/components/ui';
import { colors, radius } from '@/constants/brand';
import type { AppIconName } from '@/components/app-icon';
import type { HumanState, NextRequiredAction, ProgressStep, UxPrimaryActionKind, UxSecondaryActionKind } from '@/lib/ux-flow';

export function humanStateTone(state: HumanState): 'action' | 'wait' | 'progress' | 'done' | 'warn' {
  if (state === 'CONCERN_OPEN' || state === 'CANCELLED') return 'warn';
  if (state === 'COMPLETE') return 'done';
  if (state === 'EVIDENCE_PROCESSING' || state === 'IN_TRANSIT') return 'progress';
  if (state === 'WAITING_ON_BUYER' || state === 'WAITING_ON_SELLER') return 'wait';
  return 'action';
}

export function iconForAction(kind: UxPrimaryActionKind | UxSecondaryActionKind): AppIconName {
  switch (kind) {
    case 'EDIT_TERMS': return 'pencil';
    case 'INVITE_BUYER':
    case 'RESEND_INVITE': return 'person.badge.plus';
    case 'CONFIRM_TERMS':
    case 'COMPLETE_TRANSACTION':
    case 'AUTHORIZE_RETURN':
    case 'COMPLETE_RETURN':
    case 'OPEN_PASSPORT': return 'checkmark.shield.fill';
    case 'START_PACKING':
    case 'RECORD_UNBOXING':
    case 'RECORD_RETURN_PACKING':
    case 'RECORD_RETURN_UNBOXING': return 'video.fill';
    case 'RECORD_SEAL':
    case 'RECORD_ARRIVAL':
    case 'RECORD_RETURN_SEAL': return 'camera.fill';
    case 'ADD_SHIPMENT':
    case 'ADD_RETURN_SHIPMENT': return 'truck.box.fill';
    case 'CONFIRM_HANDOFF': return 'person.2.fill';
    default: return 'checkmark.circle.fill';
  }
}

export function HumanStateBadge({ state, label }: { state: HumanState; label: string }) {
  const tone = humanStateTone(state);
  return (
    <View style={[styles.badge, styles[`badge_${tone}`]]}>
      <View style={[styles.badgeDot, styles[`dot_${tone}`]]} />
      <Text style={[styles.badgeText, styles[`badgeText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function WorkflowProgress({ steps }: { steps: ProgressStep[] }) {
  return (
    <View style={styles.progress}>
      <Text style={styles.progressEyebrow}>PROGRESS</Text>
      {steps.map((step) => (
        <View key={step.id} style={styles.progressRow}>
          <Text style={[
            styles.progressMark,
            step.state === 'done' && styles.progressDone,
            step.state === 'current' && styles.progressCurrent,
          ]}>
            {step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}
          </Text>
          <Text style={[
            styles.progressLabel,
            step.state === 'upcoming' && styles.progressMuted,
            step.state === 'current' && styles.progressCurrentLabel,
          ]}>
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function NextActionCard({
  ux,
  busy = false,
  outcome,
  onPrimary,
  onSecondary,
}: {
  ux: NextRequiredAction;
  busy?: boolean;
  outcome?: { succeeded: string; nextStep: string } | null;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  return (
    <Card style={styles.nextCard}>
      <HumanStateBadge state={ux.humanState} label={ux.humanStateLabel} />
      {outcome ? (
        <View style={styles.outcome}>
          <Text style={styles.outcomeTitle}>{outcome.succeeded}</Text>
          <Text style={styles.body}>{outcome.nextStep}</Text>
        </View>
      ) : null}
      <Text style={styles.headline}>{ux.headline}</Text>
      <Text style={styles.body}>{ux.description}</Text>
      <Text style={styles.instruction}>{ux.instruction}</Text>
      {ux.nextHappens ? <Text style={styles.nextHappens}>{ux.nextHappens}</Text> : null}
      {ux.prerequisites.length ? (
        <View style={styles.prereqList}>
          {ux.prerequisites.map((item) => (
            <Text key={item.label} style={[styles.prereq, item.complete && styles.prereqDone]}>
              {item.complete ? '✓' : '○'} {item.label}
            </Text>
          ))}
        </View>
      ) : null}
      {ux.lockedExplanation && !ux.primaryAction ? <Text style={styles.lock}>{ux.lockedExplanation}</Text> : null}
      {ux.primaryAction && onPrimary ? (
        <Button
          label={ux.primaryAction.label}
          icon={iconForAction(ux.primaryAction.kind)}
          busy={busy}
          onPress={onPrimary}
        />
      ) : null}
      {ux.secondaryAction && onSecondary && ux.secondaryAction.kind !== 'OPEN_PASSPORT' ? (
        <Button
          label={ux.secondaryAction.label}
          icon={iconForAction(ux.secondaryAction.kind)}
          variant="secondary"
          onPress={onSecondary}
        />
      ) : null}
    </Card>
  );
}

export function InboxSection({ title, children, empty }: { title: string; children: ReactNode; empty?: string }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionList}>
      {hasChildren ? children : empty ? <Text style={styles.empty}>{empty}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  badge_action: { backgroundColor: 'rgba(70,124,99,0.12)' },
  badge_wait: { backgroundColor: 'rgba(138,91,0,0.10)' },
  badge_progress: { backgroundColor: 'rgba(45,106,138,0.10)' },
  badge_done: { backgroundColor: 'rgba(70,124,99,0.12)' },
  badge_warn: { backgroundColor: 'rgba(220,40,40,0.09)' },
  badgeDot: { width: 7, height: 7, borderRadius: 4 },
  dot_action: { backgroundColor: colors.teal },
  dot_wait: { backgroundColor: colors.amber },
  dot_progress: { backgroundColor: colors.blue },
  dot_done: { backgroundColor: colors.teal },
  dot_warn: { backgroundColor: colors.danger },
  badgeText: { fontWeight: '800', fontSize: 11, letterSpacing: 0.4 },
  badgeText_action: { color: colors.tealDark },
  badgeText_wait: { color: colors.amber },
  badgeText_progress: { color: colors.blue },
  badgeText_done: { color: colors.tealDark },
  badgeText_warn: { color: colors.danger },
  nextCard: { gap: 10 },
  headline: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  instruction: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  nextHappens: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  lock: { color: colors.amber, fontSize: 12, lineHeight: 18 },
  prereqList: { gap: 6, marginTop: 2 },
  prereq: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  prereqDone: { color: colors.teal },
  outcome: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: 'rgba(70,124,99,0.10)' },
  outcomeTitle: { color: colors.tealDark, fontSize: 16, fontWeight: '900' },
  progress: { gap: 8, paddingTop: 4 },
  progressEyebrow: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: 4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressMark: { width: 18, color: colors.muted, fontSize: 14, fontWeight: '900' },
  progressDone: { color: colors.teal },
  progressCurrent: { color: colors.teal },
  progressLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  progressCurrentLabel: { color: colors.tealDark, fontWeight: '900' },
  progressMuted: { color: colors.muted, fontWeight: '600' },
  section: { gap: 12 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  sectionList: { gap: 12 },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
