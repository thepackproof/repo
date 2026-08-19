import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card } from './ui';
import { iconForAction } from './ux-orchestration';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import { hrefForPrimaryAction, resolveNextRequiredAction, viewerRole, type NextRequiredAction } from '@/lib/ux-flow';
import type { PackProofTransaction } from '@/types/models';

export function transactionUx(transaction: PackProofTransaction, uid: string): NextRequiredAction {
  return resolveNextRequiredAction({
    transaction,
    viewerId: uid,
  });
}

export function TransactionCard({
  transaction,
  uid,
  surface = 'library',
}: {
  transaction: PackProofTransaction;
  uid: string;
  surface?: 'home-task' | 'home-wait' | 'library';
}) {
  const router = useRouter();
  const role = viewerRole(transaction, uid);
  const ux = transactionUx(transaction, uid);
  const detailHref = { pathname: '/transaction/[id]' as const, params: { id: transaction.id } };
  const actionHref = ux.primaryAction
    ? hrefForPrimaryAction(ux.primaryAction.kind, transaction.id)
    : detailHref;
  const open = surface === 'home-task' ? actionHref : detailHref;

  return (
    <Pressable onPress={() => router.push(open)}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.copy}>
            <Text style={styles.role}>{role === 'SELLER' ? 'Selling' : 'Buying'} · {formatMoney(transaction.priceMinor, transaction.currency)}</Text>
            <Text numberOfLines={2} style={styles.title}>{transaction.title}</Text>
          </View>
        </View>
        <Text style={styles.sentence}>{surface === 'library' ? ux.headline : ux.inboxSentence}</Text>
        {surface === 'home-task' && ux.completedContext.length ? (
          <Text style={styles.saved}>{ux.completedContext.map((item) => `${item} ✓`).join('  ')}</Text>
        ) : null}
        {surface === 'home-task' && ux.primaryAction ? (
          <Button
            label={ux.primaryAction.label}
            icon={iconForAction(ux.primaryAction.kind)}
            onPress={() => router.push(actionHref)}
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
  sentence: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  saved: { color: colors.teal, fontSize: 13, fontWeight: '700' },
});
