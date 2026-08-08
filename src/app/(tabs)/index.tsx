import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button, Card, EmptyState } from '@/components/ui';
import { TransactionCard } from '@/components/transaction-card';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { items } = useTransactions(user?.uid);
  const active = items.filter((item) => !['COMPLETED', 'ARCHIVED', 'CANCELLED'].includes(item.status));
  const verified = items.reduce((count, item) => count + (['PACKED', 'SHIPPED', 'BUYER_REVIEW', 'COMPLETED'].includes(item.status) ? 1 : 0), 0);

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View><Text style={styles.hello}>GOOD TO SEE YOU</Text><Text style={styles.name}>{profile?.displayName?.split(' ')[0] ?? 'Collector'}</Text></View>
        <View style={styles.badge}><SymbolView name="checkmark.shield.fill" size={22} tintColor={colors.teal} /></View>
      </View>

      <Card style={styles.hero}>
        <View style={styles.heroIcon}><SymbolView name="shippingbox.and.arrow.backward.fill" size={28} tintColor={colors.teal} /></View>
        <Text style={styles.heroTitle}>Create a transaction passport</Text>
        <Text style={styles.heroBody}>Document the exact item, lock the terms with your buyer, and capture fulfillment evidence in one private record.</Text>
        <Button label="Start a PackProof" icon="plus" onPress={() => router.push('/transaction/new')} />
      </Card>

      <View style={styles.stats}>
        <Card style={styles.stat}><Text style={styles.statValue}>{active.length}</Text><Text style={styles.statLabel}>ACTIVE</Text></Card>
        <Card style={styles.stat}><Text style={styles.statValue}>{verified}</Text><Text style={styles.statLabel}>VERIFIED</Text></Card>
        <Card style={styles.stat}><Text style={styles.statValue}>{profile?.plan === 'PRO' ? 'PRO' : 'FREE'}</Text><Text style={styles.statLabel}>PLAN</Text></Card>
      </View>

      <View>
        <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Needs attention</Text><Text onPress={() => router.push('/(tabs)/transactions')} style={styles.link}>View all</Text></View>
        <View style={styles.list}>
          {active.slice(0, 3).map((item) => <TransactionCard key={item.id} transaction={item} uid={user!.uid} />)}
          {!active.length ? <EmptyState title="Nothing waiting on you" body="Your active PackProofs will appear here with the next required action." /> : null}
        </View>
      </View>

      <Card style={styles.notice}>
        <SymbolView name="info.circle.fill" size={20} tintColor={colors.blue} />
        <Text style={styles.noticeText}>PackProof records evidence and mutual acknowledgements. It does not authenticate merchandise, transfer money, provide insurance, or determine who is right in a dispute.</Text>
      </Card>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hello: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  name: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  badge: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(33,212,180,0.08)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(33,212,180,0.25)' },
  hero: { gap: 12, padding: 22 },
  heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(33,212,180,0.09)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: colors.ink, fontSize: 23, lineHeight: 28, fontWeight: '900' },
  heroBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 4 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 16 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  link: { color: colors.teal, fontSize: 13, fontWeight: '800' },
  list: { gap: 12 },
  notice: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', backgroundColor: 'rgba(104,169,255,0.05)' },
  noticeText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
});
