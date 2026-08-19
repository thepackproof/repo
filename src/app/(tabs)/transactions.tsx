import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, EmptyState, ScreenTitle } from '@/components/ui';
import { TransactionCard, transactionUx } from '@/components/transaction-card';
import { InboxSection } from '@/components/ux-orchestration';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { groupByInboxBucket } from '@/lib/ux-flow';

export default function TransactionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
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
        <ScreenTitle eyebrow="Inbox" title="Your PackProofs" subtitle="Find the next thing you need to do, then what you are waiting on." />
        {!items.length ? (
          <EmptyState
            title="No PackProofs yet"
            body="Create a shared record before the item changes hands."
            action={<Button label="Start a PackProof" onPress={() => router.push('/transaction/new')} />}
          />
        ) : (
          <View style={styles.list}>
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
              {grouped.COMPLETED.map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
            </InboxSection> : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36 },
  list: { gap: 24 },
});
