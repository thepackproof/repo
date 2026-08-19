import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Button, EmptyState } from '@/components/ui';
import { TransactionCard, transactionUx } from '@/components/transaction-card';
import { InboxSection } from '@/components/ux-orchestration';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { useOfflineEvidence } from '@/providers/offline-evidence-provider';
import { queueAttentionMessage } from '@/lib/queue-attention';
import { groupHomeInbox } from '@/lib/ux-flow';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { items } = useTransactions(user?.uid);
  const { queuedCount, attentionCount, attentionReason, syncNow, retryAttention } = useOfflineEvidence();
  const grouped = user ? groupHomeInbox(items, (item) => transactionUx(item, user.uid)) : {
    needsAttention: [],
    waiting: [],
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>WHAT TO DO</Text>
            <Text style={styles.name}>{profile?.displayName?.split(' ')[0] ?? 'Collector'}</Text>
          </View>
          <Pressable onPress={() => router.push('/transaction/new')} style={styles.newButton} accessibilityRole="button" accessibilityLabel="Start a PackProof">
            <AppIcon name="plus" size={20} tintColor={colors.teal} />
          </Pressable>
        </View>

        {queuedCount || attentionCount ? (
          <View style={styles.queue}>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>{attentionCount ? 'Your recording is safe' : 'Evidence saved securely'}</Text>
              <Text style={styles.queueText}>
                {attentionCount && attentionReason
                  ? queueAttentionMessage(attentionReason)
                  : 'Uploading when your connection returns. You can leave PackProof.'}
              </Text>
            </View>
            {attentionCount ? <Button label="Retry" variant="secondary" onPress={retryAttention} /> : queuedCount ? <Button label="Sync now" variant="secondary" onPress={syncNow} /> : null}
          </View>
        ) : null}

        {!grouped.needsAttention.length && !grouped.waiting.length ? (
          <EmptyState
            title="You're all caught up"
            body="Start a PackProof when you sell or ship something. PackProof will tell you the next step."
            action={<Button label="Start a PackProof" onPress={() => router.push('/transaction/new')} />}
          />
        ) : (
          <>
            <InboxSection title="Needs your attention" empty="Nothing waiting on you.">
              {grouped.needsAttention.map((item) => (
                <TransactionCard key={item.id} transaction={item} uid={user!.uid} surface="home-task" />
              ))}
            </InboxSection>
            {grouped.waiting.length ? (
              <InboxSection title="Waiting">
                {grouped.waiting.map((item) => (
                  <TransactionCard key={item.id} transaction={item} uid={user!.uid} surface="home-wait" />
                ))}
              </InboxSection>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hello: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  name: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  newButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(70,124,99,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(70,124,99,0.25)' },
  queue: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(70,124,99,0.08)', borderWidth: 1, borderColor: 'rgba(70,124,99,0.25)' },
  queueTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  queueText: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
});
