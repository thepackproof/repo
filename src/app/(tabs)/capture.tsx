import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Card, EmptyState, ScreenTitle } from '@/components/ui';
import { HumanStateBadge, iconForAction } from '@/components/ux-orchestration';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { useOfflineEvidence } from '@/providers/offline-evidence-provider';
import { queueAttentionMessage } from '@/lib/queue-attention';
import { CAPTURE_PRIMARY_ACTIONS, captureTypeForAction, resolveNextRequiredAction } from '@/lib/ux-flow';

export default function CaptureHub() {
  const router = useRouter();
  const { user } = useAuth();
  const { items } = useTransactions(user?.uid);
  const { queuedCount, attentionCount, attentionReason, syncNow, retryAttention } = useOfflineEvidence();
  const ready = user
    ? items
      .map((item) => ({ item, ux: resolveNextRequiredAction({ transaction: item, viewerId: user.uid }) }))
      .filter((row) => row.ux.primaryAction && CAPTURE_PRIMARY_ACTIONS.has(row.ux.primaryAction.kind))
    : [];
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.container}>
    <ScreenTitle eyebrow="Capture" title="Ready to record" subtitle="Only PackProofs that need a capture from you appear here." />
    {queuedCount || attentionCount ? <View style={styles.queue}><View style={{ flex: 1 }}><Text style={styles.queueTitle}>{attentionCount ? 'An upload needs a retry' : 'Uploading evidence'}</Text><Text style={styles.queueText}>{attentionCount && attentionReason ? queueAttentionMessage(attentionReason) : 'You can leave this screen. PackProof will update when it finishes.'}</Text></View>{attentionCount ? <Button label="Retry" variant="secondary" onPress={retryAttention} /> : queuedCount ? <Button label="Sync now" variant="secondary" onPress={syncNow} /> : null}</View> : null}
    <View style={styles.list}>
      {ready.map(({ item, ux }) => {
        const type = captureTypeForAction(ux.primaryAction?.kind) ?? 'CONDITION_PHOTO';
        return <Card key={item.id} style={styles.card}>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={styles.title}>{item.title}</Text>
            <HumanStateBadge state={ux.humanState} label={ux.humanStateLabel} />
            <Text style={styles.sentence}>{ux.inboxSentence}</Text>
          </View>
          <Button
            label={ux.primaryAction?.label ?? 'Start capture'}
            icon={ux.primaryAction ? iconForAction(ux.primaryAction.kind) : 'camera.fill'}
            onPress={() => router.push({ pathname: '/capture/[id]', params: { id: item.id, type } })}
          />
        </Card>;
      })}
      {!ready.length ? <EmptyState icon="camera.fill" title="Nothing needs capturing" body="When packing or delivery evidence is your next step, it will show up here with one clear button." /> : null}
    </View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  queue: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(70,124,99,0.08)', borderWidth: 1, borderColor: 'rgba(70,124,99,0.25)', marginBottom: 12 },
  queueTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  queueText: { color: colors.muted, fontSize: 10, marginTop: 3 },
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36 },
  list: { gap: 12 },
  card: { gap: 16 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  sentence: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
