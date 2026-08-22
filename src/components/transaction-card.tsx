import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from './ui';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import { evidenceProcessingForTransaction, resolveNextRequiredAction, viewerRole, type EvidenceResumeObservation, type NextRequiredAction, type PackageSealProtocolStatus } from '@/lib/ux-flow';
import type { PackProofTransaction } from '@/types/models';

export function transactionUx(
  transaction: PackProofTransaction,
  uid: string,
  queueItems: readonly EvidenceResumeObservation[] = [],
  protocol: PackageSealProtocolStatus | null = null,
): NextRequiredAction {
  return resolveNextRequiredAction({
    transaction,
    viewerId: uid,
    protocol,
    evidenceProcessing: evidenceProcessingForTransaction(transaction.id, queueItems),
  });
}

export function TransactionCard({
  transaction,
  uid,
  queueItems = [],
}: {
  transaction: PackProofTransaction;
  uid: string;
  queueItems?: readonly EvidenceResumeObservation[];
}) {
  const router = useRouter();
  const role = viewerRole(transaction, uid);
  const ux = transactionUx(transaction, uid, queueItems);

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
