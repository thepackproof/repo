import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, EmptyState, ScreenTitle } from '@/components/ui';
import { TransactionCard, transactionUx } from '@/components/transaction-card';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { groupLibrary } from '@/lib/ux-flow';

export default function TransactionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { items } = useTransactions(user?.uid);
  const [segment, setSegment] = useState<'active' | 'completed'>('active');
  const grouped = user ? groupLibrary(items, (item) => transactionUx(item, user.uid)) : {
    active: [],
    completed: [],
  };
  const visible = segment === 'active' ? grouped.active : grouped.completed;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenTitle title="Your PackProofs" subtitle="Active and finished records. Current tasks live on Home." />
        <View style={styles.segments}>
          <Pressable onPress={() => setSegment('active')} style={[styles.segment, segment === 'active' && styles.segmentOn]}>
            <Text style={[styles.segmentText, segment === 'active' && styles.segmentTextOn]}>Active</Text>
          </Pressable>
          <Pressable onPress={() => setSegment('completed')} style={[styles.segment, segment === 'completed' && styles.segmentOn]}>
            <Text style={[styles.segmentText, segment === 'completed' && styles.segmentTextOn]}>Completed</Text>
          </Pressable>
        </View>
        {!items.length ? (
          <EmptyState
            title="No PackProofs yet"
            body="Start one from Home when you have something to protect."
            action={<Button label="Start a PackProof" onPress={() => router.push('/transaction/new')} />}
          />
        ) : !visible.length ? (
          <EmptyState
            title={segment === 'active' ? 'No active PackProofs' : 'No completed PackProofs yet'}
            body={segment === 'active' ? 'Finished records will show under Completed.' : 'Finished PackProofs will collect here.'}
          />
        ) : (
          <View style={styles.list}>
            {visible.map((item) => (
              <TransactionCard key={item.id} transaction={item} uid={user!.uid} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36, gap: 16 },
  segments: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segmentOn: { backgroundColor: colors.card },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  segmentTextOn: { color: colors.ink },
  list: { gap: 12 },
});
