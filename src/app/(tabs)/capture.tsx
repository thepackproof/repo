import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button, Card, EmptyState, ScreenTitle, StatusPill } from '@/components/ui';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { useOfflineEvidence } from '@/providers/offline-evidence-provider';

export default function CaptureHub() {
  const router = useRouter();
  const { user } = useAuth();
  const { items } = useTransactions(user?.uid);
  const { queuedCount, syncNow } = useOfflineEvidence();
  const eligible = items.filter((item) => ['TERMS_LOCKED', 'PACKED', 'SHIPPED', 'BUYER_REVIEW', 'DISPUTED'].includes(item.status));
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.container}>
    <ScreenTitle eyebrow="Guided evidence" title="Capture" subtitle="Record directly inside the transaction so every file receives a trusted server timestamp and SHA-256 fingerprint." />
    {queuedCount ? <View style={styles.queue}><View style={{ flex: 1 }}><Text style={styles.queueTitle}>{queuedCount} encrypted capture{queuedCount === 1 ? '' : 's'} waiting to sync</Text><Text style={styles.queueText}>PackProof retries automatically when connectivity returns.</Text></View><Button label="Sync now" variant="secondary" onPress={syncNow} /></View> : null}
    <View style={styles.tip}><SymbolView name="exclamationmark.shield.fill" size={23} tintColor={colors.amber} /><Text style={styles.tipText}>Packing and unboxing videos must be continuous. Do not pause, trim or edit the recording before upload.</Text></View>
    <View style={styles.list}>
      {eligible.map((item) => {
        const seller = item.sellerId === user!.uid;
        const type = seller ? 'PACKING_VIDEO' : 'UNBOXING_VIDEO';
        const canVideo = seller ? item.status === 'TERMS_LOCKED' : item.status === 'SHIPPED';
        return <Card key={item.id} style={styles.card}>
          <View style={{ flex: 1, gap: 8 }}><Text style={styles.title}>{item.title}</Text><StatusPill status={item.status} /></View>
          <Button label={canVideo ? (seller ? 'Packing video' : 'Unboxing video') : 'Condition photo'} icon="camera.fill" variant="secondary" onPress={() => router.push({ pathname: '/capture/[id]', params: { id: item.id, type: canVideo ? type : 'CONDITION_PHOTO' } })} />
        </Card>;
      })}
      {!eligible.length ? <EmptyState icon="camera.fill" title="Nothing ready for capture" body="After both parties confirm the transaction terms, the guided packing or unboxing workflow will appear here." /> : null}
    </View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ queue: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(33,212,180,0.08)', borderWidth: 1, borderColor: 'rgba(33,212,180,0.25)', marginBottom: 12 }, queueTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' }, queueText: { color: colors.muted, fontSize: 10, marginTop: 3 }, safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 36 }, tip: { flexDirection: 'row', gap: 12, padding: 15, borderRadius: 16, backgroundColor: 'rgba(255,190,85,0.08)', borderWidth: 1, borderColor: 'rgba(255,190,85,0.25)', marginBottom: 18 }, tipText: { flex: 1, color: colors.amber, fontSize: 12, lineHeight: 18, fontWeight: '600' }, list: { gap: 12 }, card: { gap: 16 }, title: { color: colors.ink, fontSize: 17, fontWeight: '800' } });
