import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/constants/brand';
import { formatMoney } from '@/lib/format';
import type { PackProofTransaction } from '@/types/models';

export function dealReturnLine(transaction: PackProofTransaction): string {
  const { returns, returnWindowDays } = transaction.terms;
  if (returns === 'NO_RETURNS') return 'No returns';
  if (returns === 'PLATFORM_POLICY') return 'Returns follow the marketplace policy';
  if (returnWindowDays > 0) return `Returns as agreed, ${returnWindowDays} days`;
  return 'Returns as agreed';
}

export function dealShippingLine(transaction: PackProofTransaction): string | null {
  const { saleType, shippingResponsibility } = transaction.terms;
  if (saleType === 'LOCAL_HANDOFF') return 'Local handoff';
  if (shippingResponsibility === 'BUYER') return 'Buyer pays shipping';
  if (shippingResponsibility === 'SELLER') return 'Seller pays shipping';
  return 'Shipped';
}

export function DealFacts({ transaction }: { transaction: PackProofTransaction }) {
  const shipping = dealShippingLine(transaction);
  return (
    <View style={styles.deal}>
      <Text style={styles.title}>{transaction.title}</Text>
      <Text style={styles.price}>{formatMoney(transaction.priceMinor, transaction.currency)}</Text>
      {shipping ? <Text style={styles.line}>{shipping}</Text> : null}
      <Text style={styles.line}>{dealReturnLine(transaction)}</Text>
      {transaction.terms.customTerms.trim() ? <Text style={styles.line}>{transaction.terms.customTerms.trim()}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deal: { gap: 6, alignItems: 'center', marginTop: 4 },
  title: { color: colors.ink, fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center' },
  price: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  line: { color: colors.muted, fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
