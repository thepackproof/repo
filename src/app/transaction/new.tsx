import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, Choice, Field, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { callFunction, subscribeTransaction } from '@/lib/api';
import { readableError } from '@/lib/format';

export default function NewTransaction() {
  const router = useRouter();
  const { transactionId } = useLocalSearchParams<{ transactionId?: string }>();
  const hydratedTransactionId = useRef<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Collectible');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [identifiers, setIdentifiers] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [saleType, setSaleType] = useState<'SHIPPED' | 'LOCAL_HANDOFF'>('SHIPPED');
  const [shippingResponsibility, setShippingResponsibility] = useState<'SELLER' | 'BUYER' | 'NOT_APPLICABLE'>('SELLER');
  const [returns, setReturns] = useState<'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY'>('AS_AGREED');
  const [returnWindow, setReturnWindow] = useState('0');
  const [customTerms, setCustomTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(transactionId));
  const valid = useMemo(() => title.trim().length > 2 && category.trim().length > 1 && Number.isFinite(Number(price)) && Number(price) >= 0, [category, price, title]);

  useEffect(() => {
    if (!transactionId) return;
    return subscribeTransaction(transactionId, (item) => {
      if (hydratedTransactionId.current === transactionId) return;
      if (!item) {
        setLoadingExisting(false);
        Alert.alert('PackProof not found', 'This draft is no longer available.', [{ text: 'Close', onPress: () => router.back() }]);
        return;
      }
      hydratedTransactionId.current = transactionId;
      setTitle(item.title);
      setCategory(item.category);
      setDescription(item.description);
      setPrice((item.priceMinor / 100).toFixed(2));
      setIdentifiers(item.identifiers.map(({ label, value }) => `${label}: ${value}`).join('\n'));
      setConditionNotes(item.conditionNotes);
      setSaleType(item.terms.saleType);
      setShippingResponsibility(item.terms.shippingResponsibility);
      setReturns(item.terms.returns);
      setReturnWindow(String(item.terms.returnWindowDays));
      setCustomTerms(item.terms.customTerms);
      setLoadingExisting(false);
    }, (error) => { setLoadingExisting(false); Alert.alert('Could not load PackProof', readableError(error)); });
  }, [router, transactionId]);

  const save = async () => {
    if (!valid) { Alert.alert('Check the basics', 'Add an item name, category, and valid agreed price.'); return; }
    setBusy(true);
    try {
      const parsedIdentifiers = identifiers.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [label, ...rest] = line.split(':');
        return { label: rest.length ? label.trim() : 'Identifier', value: rest.length ? rest.join(':').trim() : label.trim() };
      });
      const result = await callFunction<Record<string, unknown>, { transactionId: string }>('saveTransactionDraft', {
        ...(transactionId ? { transactionId } : {}),
        title: title.trim(), category: category.trim(), description: description.trim(),
        priceMinor: Math.round(Number(price) * 100), currency: 'USD', identifiers: parsedIdentifiers,
        conditionNotes: conditionNotes.trim(),
        terms: { saleType, shippingResponsibility: saleType === 'LOCAL_HANDOFF' ? 'NOT_APPLICABLE' : shippingResponsibility, returns, returnWindowDays: Math.max(0, Math.min(365, Number.parseInt(returnWindow || '0', 10) || 0)), customTerms: customTerms.trim() },
      });
      router.replace(`/transaction/${result.transactionId}`);
    } catch (error) {
      const message = readableError(error);
      Alert.alert(transactionId ? 'Could not update PackProof' : 'Could not create PackProof', message, message.includes('free plan') && featureFlags.billing ? [{ text: 'Not now' }, { text: 'View Pro', onPress: () => router.push('/paywall') }] : undefined);
    } finally { setBusy(false); }
  };

  if (transactionId && loadingExisting) return <LoadingScreen />;

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <Button label="Close" variant="ghost" onPress={() => router.back()} style={styles.close} />
      <ScreenTitle eyebrow={transactionId ? 'Edit transaction' : 'New transaction'} title="Describe the exact deal" subtitle="This becomes the version your buyer reviews. You can edit it until both parties confirm and lock the terms." />
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Item</Text>
        <Field label="Item name" value={title} onChangeText={setTitle} placeholder="e.g. CGC 9.8 Amazing Spider-Man #300" autoCapitalize="sentences" />
        <Field label="Category" value={category} onChangeText={setCategory} placeholder="Collectible, watch, electronics…" />
        <Field label="Description" value={description} onChangeText={setDescription} placeholder="Edition, provenance, included accessories and anything else defining the item." multiline />
        <Field label="Agreed price (USD)" value={price} onChangeText={setPrice} placeholder="1250.00" keyboardType="decimal-pad" />
      </Card>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Identity & condition</Text>
        <Field label="Identifiers" value={identifiers} onChangeText={setIdentifiers} placeholder={'Certification: 1234567001\nSerial: ABC-123\nCOA: PSA/DNA X00000'} multiline hint="Use one Label: Value entry per line. Do not include government IDs or payment-card information." />
        <Field label="Condition notes" value={conditionNotes} onChangeText={setConditionNotes} placeholder="Record visible defects and condition claims precisely." multiline />
      </Card>
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Fulfillment terms</Text>
        <Text style={styles.label}>How will the item change hands?</Text>
        <View style={styles.choices}><Choice label="Shipped" selected={saleType === 'SHIPPED'} onPress={() => setSaleType('SHIPPED')} /><Choice label="Local handoff" selected={saleType === 'LOCAL_HANDOFF'} onPress={() => setSaleType('LOCAL_HANDOFF')} /></View>
        {saleType === 'SHIPPED' ? <><Text style={styles.label}>Who is responsible for shipping cost?</Text><View style={styles.choices}><Choice label="Seller" selected={shippingResponsibility === 'SELLER'} onPress={() => setShippingResponsibility('SELLER')} /><Choice label="Buyer" selected={shippingResponsibility === 'BUYER'} onPress={() => setShippingResponsibility('BUYER')} /></View></> : null}
        <Text style={styles.label}>Return agreement</Text>
        <View style={styles.choices}><Choice label="As agreed below" selected={returns === 'AS_AGREED'} onPress={() => setReturns('AS_AGREED')} /><Choice label="No returns" selected={returns === 'NO_RETURNS'} onPress={() => setReturns('NO_RETURNS')} /><Choice label="Platform policy" selected={returns === 'PLATFORM_POLICY'} onPress={() => setReturns('PLATFORM_POLICY')} /></View>
        <Field label="Return window in days" value={returnWindow} onChangeText={setReturnWindow} keyboardType="number-pad" />
        <Field label="Additional terms" value={customTerms} onChangeText={setCustomTerms} placeholder="Payment status, who carries transit risk, inspection period, exclusions, or other mutually agreed terms." multiline />
      </Card>
      <Card style={styles.disclaimer}><Text style={styles.disclaimerText}>PackProof preserves what the parties submit and confirm. It is not legal advice and does not make an item authentic or a transaction enforceable.</Text></Card>
      <Button label={transactionId ? 'Save proposed terms' : 'Create PackProof'} icon="checkmark.shield.fill" busy={busy} disabled={!valid} onPress={save} />
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 44, gap: 14 }, close: { alignSelf: 'flex-start', minHeight: 40 }, section: { gap: 16 }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, label: { color: colors.ink, fontSize: 13, fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, disclaimer: { backgroundColor: 'rgba(104,169,255,0.05)' }, disclaimerText: { color: colors.muted, fontSize: 11, lineHeight: 17 } });
