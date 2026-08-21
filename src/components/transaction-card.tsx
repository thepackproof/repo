import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from './ui';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import { resolveNextRequiredAction, toUxFlowInput, viewerRole, type NextRequiredAction } from '@/lib/ux-flow';
import type { PackProofTransaction } from '@/types/models';

export function transactionUx(
  transaction: PackProofTransaction,
  uid: string,
  extras: Parameters<typeof toUxFlowInput>[2] = {},
): NextRequiredAction {
  return resolveNextRequiredAction(toUxFlowInput(transaction, uid, extras));
}

export function TransactionCard({
  transaction,
  uid,
}: {
  transaction: PackProofTransaction;
  uid: string;
}) {
  const router = useRouter();
  const role = viewerRole(transaction, uid);
  const ux = transactionUx(transaction, uid);

  return (
    <Pressable onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: transaction.id } })}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.copy}>
            <Text style={styles.role}>{role === 'SELLER' ? 'Selling' : 'Buying'} · {formatMoney(transaction.priceMinor, transaction.currency)}</Text>
            <Text numberOfLines={2} style={styles.title}>{transaction.title}</Text>
          </View>
        </View>
        <Text style={styles.sentence}>{ux.headline}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  copy: { flex: 1, gap: 5 },
  role: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  title: { color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  sentence: { color: colors.muted, fontSize: 15, lineHeight: 21 },
});
