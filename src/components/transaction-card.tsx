import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from './ui';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import type { NextRequiredAction, TransactionWorkspaceProjectionV1 } from '@/lib/ux-flow';

export function transactionUx(workspace: TransactionWorkspaceProjectionV1): NextRequiredAction {
  return workspace.nextAction;
}

export function TransactionCard({
  workspace,
}: {
  workspace: TransactionWorkspaceProjectionV1;
}) {
  const router = useRouter();
  const completed = workspace.lifecycle.consumerState === 'complete';
  const href = completed && workspace.proof.availability === 'AVAILABLE'
    ? { pathname: '/passport/[id]' as const, params: { id: workspace.transactionId } }
    : { pathname: '/transaction/[id]' as const, params: { id: workspace.transactionId } };

  return (
    <Pressable onPress={() => router.push(href)}>
      <Card style={styles.card}>
        <View style={styles.top}>
          <View style={styles.copy}>
            <Text style={styles.role}>{workspace.viewer.role === 'SELLER' ? 'Selling' : 'Buying'} · {formatMoney(workspace.display.priceMinor, workspace.display.currency)}</Text>
            <Text numberOfLines={2} style={styles.title}>{workspace.display.title}</Text>
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
