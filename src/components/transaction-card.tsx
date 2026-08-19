import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card } from './ui';
import { HumanStateBadge, iconForAction } from './ux-orchestration';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import { resolveNextRequiredAction, viewerRole, type NextRequiredAction } from '@/lib/ux-flow';
import type { PackProofTransaction } from '@/types/models';

export function transactionUx(transaction: PackProofTransaction, uid: string): NextRequiredAction {
  return resolveNextRequiredAction({
    transaction,
    viewerId: uid,
  });
}

export function TransactionCard({ transaction, uid }: { transaction: PackProofTransaction; uid: string }) {
  const router = useRouter();
  const role = viewerRole(transaction, uid);
  const ux = transactionUx(transaction, uid);
  return (
    <Pressable onPress={() => router.push(`/transaction/${transaction.id}`)}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.copy}>
            <Text style={styles.role}>{role === 'SELLER' ? 'Selling' : 'Buying'}</Text>
            <Text numberOfLines={2} style={styles.title}>{transaction.title}</Text>
          </View>
          <Text style={styles.price}>{formatMoney(transaction.priceMinor, transaction.currency)}</Text>
        </View>
        <HumanStateBadge state={ux.humanState} label={ux.humanStateLabel} />
        <Text style={styles.sentence}>{ux.inboxSentence}</Text>
        {ux.primaryAction ? (
          <Button
            label={ux.primaryAction.label}
            icon={iconForAction(ux.primaryAction.kind)}
            onPress={() => router.push(`/transaction/${transaction.id}`)}
          />
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  copy: { flex: 1, gap: 5 },
  role: { color: colors.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: '800' },
  title: { color: colors.ink, fontSize: 18, lineHeight: 23, fontWeight: '800' },
  price: { color: colors.teal, fontSize: 16, fontWeight: '900' },
  sentence: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
