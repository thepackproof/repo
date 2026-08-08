import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Button, Choice, EmptyState, ScreenTitle } from '@/components/ui';
import { TransactionCard } from '@/components/transaction-card';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';

export default function TransactionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { items } = useTransactions(user?.uid);
  const [filter, setFilter] = useState<'ACTIVE' | 'COMPLETE' | 'ALL'>('ACTIVE');
  const filtered = useMemo(() => items.filter((item) => filter === 'ALL' || (filter === 'COMPLETE' ? ['COMPLETED', 'ARCHIVED'].includes(item.status) : !['COMPLETED', 'ARCHIVED', 'CANCELLED'].includes(item.status))), [filter, items]);

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.container}>
    <ScreenTitle eyebrow="Private records" title="Your PackProofs" subtitle="Every transaction stays visible only to its participants." />
    <View style={styles.filters}>
      {(['ACTIVE', 'COMPLETE', 'ALL'] as const).map((value) => <Choice key={value} label={value === 'COMPLETE' ? 'Completed' : value[0] + value.slice(1).toLowerCase()} selected={filter === value} onPress={() => setFilter(value)} />)}
    </View>
    <View style={styles.list}>
      {filtered.map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
      {!filtered.length ? <EmptyState title="No PackProofs here yet" body="Create a secure transaction record before the item changes hands." action={<Button label="Create PackProof" onPress={() => router.push('/transaction/new')} />} /> : null}
    </View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 36 }, filters: { flexDirection: 'row', gap: 8, marginBottom: 18 }, list: { gap: 12 } });
