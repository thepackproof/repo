import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, ProgressBar, StatusPill } from './ui';
import { colors } from '@/constants/brand';
import { formatMoney, statusProgress } from '@/lib/format';
import { nextParticipantAction } from '@/lib/package-seal-protocol';
import type { PackProofTransaction } from '@/types/models';

export function TransactionCard({ transaction, uid }: { transaction: PackProofTransaction; uid: string }) {
  const router = useRouter();
  const role = transaction.sellerId === uid ? 'SELLER' : 'BUYER';
  const nextAction = nextParticipantAction({
    status: transaction.status,
    role,
    saleType: transaction.terms.saleType,
  });
  return <Pressable onPress={() => router.push(`/transaction/${transaction.id}`)}>
    <Card style={styles.card}>
      <View style={styles.top}>
        <View style={styles.copy}>
          <Text style={styles.role}>{role} · {transaction.category.toUpperCase()}</Text>
          <Text numberOfLines={2} style={styles.title}>{transaction.title}</Text>
        </View>
        <Text style={styles.price}>{formatMoney(transaction.priceMinor, transaction.currency)}</Text>
      </View>
      <StatusPill status={transaction.status} />
      {nextAction ? <Text style={styles.nextAction}>{nextAction}</Text> : null}
      <ProgressBar value={statusProgress[transaction.status]} />
    </Card>
  </Pressable>;
}

const styles = StyleSheet.create({
  card: { gap: 15 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  copy: { flex: 1, gap: 5 },
  role: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  price: { color: colors.teal, fontSize: 16, fontWeight: '900' },
  nextAction: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
});
