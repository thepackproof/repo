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
import { groupByInboxBucket } from '@/lib/ux-flow';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { items } = useTransactions(user?.uid);
  const grouped = user ? groupByInboxBucket(items, (item) => transactionUx(item, user.uid)) : {
    NEEDS_ATTENTION: [],
    WAITING: [],
    IN_PROGRESS: [],
    COMPLETED: [],
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>YOUR TASKS</Text>
            <Text style={styles.name}>{profile?.displayName?.split(' ')[0] ?? 'Collector'}</Text>
          </View>
          <Pressable onPress={() => router.push('/transaction/new')} style={styles.newButton} accessibilityRole="button" accessibilityLabel="Start a PackProof">
            <AppIcon name="plus" size={20} tintColor={colors.teal} />
          </Pressable>
        </View>

        {!items.length ? (
          <EmptyState
            title="Nothing in your inbox yet"
            body="Create a PackProof, agree on what is being sent, record packing, then ship. The next required action will always show up here."
            action={<Button label="Start a PackProof" onPress={() => router.push('/transaction/new')} />}
          />
        ) : (
          <>
            <InboxSection title="Needs your attention" empty="Nothing waiting on you.">
              {grouped.NEEDS_ATTENTION.map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
            </InboxSection>
            {grouped.WAITING.length ? <InboxSection title="Waiting on someone else">
              {grouped.WAITING.map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
            </InboxSection> : null}
            {grouped.IN_PROGRESS.length ? <InboxSection title="In progress">
              {grouped.IN_PROGRESS.map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
            </InboxSection> : null}
            {grouped.COMPLETED.length ? <InboxSection title="Completed">
              {grouped.COMPLETED.slice(0, 5).map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
            </InboxSection> : null}
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
});
