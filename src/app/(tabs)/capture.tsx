import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Button, Card, EmptyState, ScreenTitle, StatusPill } from '@/components/ui';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { useOfflineEvidence } from '@/providers/offline-evidence-provider';
import { queueAttentionMessage } from '@/lib/queue-attention';

export default function CaptureHub() {
  const router = useRouter();
  const { user } = useAuth();
  const { items } = useTransactions(user?.uid);
  const { queuedCount, attentionCount, attentionReason, syncNow, retryAttention } = useOfflineEvidence();
  const eligible = items.filter((item) => ['TERMS_LOCKED', 'PACKED', 'SHIPPED', 'BUYER_REVIEW', 'DISPUTED'].includes(item.status));
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.container}>
    <ScreenTitle eyebrow="Guided evidence" title="Capture" subtitle="Record directly inside the transaction so the server can add its receipt/finalization time and independently compute a SHA-256 fingerprint. Client capture time remains separately labeled." />
    {queuedCount || attentionCount ? <View style={styles.queue}><View style={{ flex: 1 }}><Text style={styles.queueTitle}>{attentionCount ? `${attentionCount} encrypted queue item${attentionCount === 1 ? '' : 's'} require attention` : `${queuedCount} encrypted capture${queuedCount === 1 ? '' : 's'} waiting to sync`}</Text><Text style={styles.queueText}>{attentionCount && attentionReason ? queueAttentionMessage(attentionReason) : 'PackProof retries automatically when connectivity returns and keeps ciphertext until server finalization.'}</Text></View>{attentionCount ? <Button label="Retry retained" variant="secondary" onPress={retryAttention} /> : queuedCount ? <Button label="Sync now" variant="secondary" onPress={syncNow} /> : null}</View> : null}
    <View style={styles.tip}><AppIcon name="exclamationmark.shield.fill" size={23} tintColor={colors.amber} /><Text style={styles.tipText}>Packing and unboxing videos must be continuous. Include the PP mark, tape or seal, and a steady high-resolution view of the label/package boundary. PackProof does not decide whether the package later matches.</Text></View>
    <View style={styles.list}>
      {eligible.map((item) => {
        const seller = item.sellerId === user!.uid;
        const type = seller
          ? item.status === 'TERMS_LOCKED' ? 'PACKING_VIDEO' : item.status === 'PACKED' ? 'SHIPPING_LABEL' : 'CONDITION_PHOTO'
          : item.status === 'SHIPPED' ? 'DELIVERY_PHOTO' : 'CONDITION_PHOTO';
        const label = type === 'PACKING_VIDEO' ? 'Packing video' : type === 'SHIPPING_LABEL' ? 'Seal reference' : type === 'DELIVERY_PHOTO' ? 'Arrival observation' : 'Condition photo';
        return <Card key={item.id} style={styles.card}>
          <View style={{ flex: 1, gap: 8 }}><Text style={styles.title}>{item.title}</Text><StatusPill status={item.status} /></View>
          <Button label={label} icon="camera.fill" variant="secondary" onPress={() => router.push({ pathname: '/capture/[id]', params: { id: item.id, type } })} />
        </Card>;
      })}
      {!eligible.length ? <EmptyState icon="camera.fill" title="Nothing ready for capture" body="After both parties confirm the transaction terms, the guided packing or unboxing workflow will appear here." /> : null}
    </View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ queue: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(70,124,99,0.08)', borderWidth: 1, borderColor: 'rgba(70,124,99,0.25)', marginBottom: 12 }, queueTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' }, queueText: { color: colors.muted, fontSize: 10, marginTop: 3 }, safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 36 }, tip: { flexDirection: 'row', gap: 12, padding: 15, borderRadius: 16, backgroundColor: 'rgba(138,91,0,0.08)', borderWidth: 1, borderColor: 'rgba(138,91,0,0.25)', marginBottom: 18 }, tipText: { flex: 1, color: colors.amber, fontSize: 12, lineHeight: 18, fontWeight: '600' }, list: { gap: 12 }, card: { gap: 16 }, title: { color: colors.ink, fontSize: 17, fontWeight: '800' } });
