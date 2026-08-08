import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button, Card } from '@/components/ui';
import { colors } from '@/constants/brand';
import { readableError } from '@/lib/format';
import { usePurchases } from '@/providers/purchases-provider';

export default function Paywall() {
  const router = useRouter();
  const { available, pro, offerings, loading, purchase, restore } = usePurchases();
  const packages = offerings?.current?.availablePackages ?? [];
  const buy = async (item: (typeof packages)[number]) => {
    try { await purchase(item); Alert.alert('PackProof Pro is active', 'Your expanded limits are ready.'); router.back(); } catch (error) { Alert.alert('Purchase not completed', readableError(error)); }
  };
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Button label="Close" variant="ghost" onPress={() => router.back()} style={styles.close} />
    <View style={styles.star}><SymbolView name="checkmark.shield.fill" size={42} tintColor={colors.teal} /></View>
    <Text style={styles.eyebrow}>PACKPROOF PRO</Text>
    <Text style={styles.title}>{pro ? 'Your evidence vault is upgraded.' : 'Protect every high-value transaction.'}</Text>
    <Text style={styles.body}>Create unlimited active PackProofs while keeping the same evidence and packet workflow available to every PackProof user.</Text>
    <Card style={styles.features}>
      {['Unlimited active transaction passports', 'Google Play purchase management', 'Purchase restoration on supported Android builds'].map((feature) => <View key={feature} style={styles.feature}><SymbolView name="checkmark.circle.fill" size={19} tintColor={colors.teal} /><Text style={styles.featureText}>{feature}</Text></View>)}
    </Card>
    {!available ? <Card><Text style={styles.pending}>PackProof Pro billing is not enabled in this build. All core transaction, capture, verification, return, and dossier features remain available.</Text></Card> : null}
    {available && !packages.length && !pro ? <Card><Text style={styles.pending}>No purchasable PackProof Pro products are currently available from Google Play.</Text></Card> : null}
    <View style={styles.packages}>{packages.map((item) => <Button key={item.identifier} label={`${item.product.title} · ${item.product.priceString}`} busy={loading} onPress={() => buy(item)} />)}</View>
    {available ? <Button label="Restore purchases" variant="ghost" busy={loading} onPress={() => restore().catch((error) => Alert.alert('Could not restore', readableError(error)))} /> : null}
    <Text style={styles.fine}>Payment is processed by Google Play. Subscriptions renew automatically unless cancelled in Google Play before the next billing date. Prices and trial eligibility are shown in Google’s purchase sheet.</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 22, paddingBottom: 42, alignItems: 'center', gap: 16 }, close: { alignSelf: 'flex-end', minHeight: 40 }, star: { width: 82, height: 82, borderRadius: 28, backgroundColor: 'rgba(33,212,180,0.09)', alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: colors.teal, fontSize: 11, fontWeight: '900', letterSpacing: 2 }, title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: '900', textAlign: 'center', maxWidth: 420 }, body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 420 }, features: { width: '100%', gap: 14 }, feature: { flexDirection: 'row', alignItems: 'center', gap: 10 }, featureText: { color: colors.ink, fontWeight: '700', fontSize: 13 }, packages: { width: '100%', gap: 10 }, pending: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }, fine: { color: colors.muted, opacity: 0.8, fontSize: 10, lineHeight: 15, textAlign: 'center' } });
