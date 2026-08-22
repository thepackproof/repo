import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from './ui';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import { viewerRole, type NextRequiredAction } from '@/lib/ux-flow';
import { workspaceFromSlice, type WorkspaceSlice } from '@/lib/workspace';
import type { PackProofTransaction } from '@/types/models';

export function transactionUx(
  transaction: PackProofTransaction,
  uid: string,
  slice: WorkspaceSlice,
): NextRequiredAction {
  return workspaceFromSlice(transaction, uid, slice).nextAction;
}

export function TransactionCard({
  transaction,
  uid,
  slice,
}: {
  transaction: PackProofTransaction;
  uid: string;
  slice: WorkspaceSlice;
}) {
  const router = useRouter();
  const role = viewerRole(transaction, uid);
  const workspace = workspaceFromSlice(transaction, uid, slice);
  const completed = workspace.lifecycle.consumerState === 'complete';
  const href = completed && workspace.proof.availability === 'AVAILABLE'
    ? { pathname: '/passport/[id]' as const, params: { id: transaction.id } }
    : { pathname: '/transaction/[id]' as const, params: { id: transaction.id } };

  return (
    <Pressable onPress={() => router.push(href)}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.copy}>
            <Text style={styles.role}>{role === 'SELLER' ? 'Selling' : 'Buying'} · {formatMoney(transaction.priceMinor, transaction.currency)}</Text>
            <Text numberOfLines={2} style={styles.title}>{transaction.title}</Text>
          </View>
        </View>
        <Text style={styles.sentence}>
          {completed && workspace.proof.availability === 'AVAILABLE' ? 'View Proof' : workspace.nextAction.headline}
        </Text>
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
