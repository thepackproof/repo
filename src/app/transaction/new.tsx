import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Button, Card, Choice, Field, LoadingScreen } from '@/components/ui';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { callFunction, subscribeTransaction } from '@/lib/api';
import { readableError } from '@/lib/format';

export default function NewTransaction() {
  const router = useRouter();
  const { transactionId } = useLocalSearchParams<{ transactionId?: string }>();
  const hydratedTransactionId = useRef<string | null>(null);
  const [step, setStep] = useState(transactionId ? 2 : 1);
  const [intent, setIntent] = useState<'SELLING' | 'BUYING' | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Collectible');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [identifiers, setIdentifiers] = useState('');
  const [conditionNotes, setConditionNotes] = useState('');
  const [saleType, setSaleType] = useState<'SHIPPED' | 'LOCAL_HANDOFF'>('SHIPPED');
  const [shippingResponsibility, setShippingResponsibility] = useState<'SELLER' | 'BUYER' | 'NOT_APPLICABLE'>('SELLER');
  const [returns, setReturns] = useState<'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY'>('AS_AGREED');
  const [returnWindow, setReturnWindow] = useState('14');
  const [customTerms, setCustomTerms] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(transactionId));
  const [pageDeclaredSource, setPageDeclaredSource] = useState<string | null>(null);
  const [listingImages, setListingImages] = useState<{ url: string; altText?: string | null }[]>([]);
  const valid = useMemo(() => title.trim().length > 2 && Number.isFinite(Number(price)) && Number(price) >= 0, [price, title]);

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
      setCurrency(item.currency);
      setIdentifiers(item.identifiers.map(({ label, value }) => `${label}: ${value}`).join('\n'));
      setConditionNotes(item.conditionNotes);
      setSaleType(item.terms.saleType);
      setShippingResponsibility(item.terms.shippingResponsibility);
      setReturns(item.terms.returns);
      setReturnWindow(String(item.terms.returnWindowDays));
      setCustomTerms(item.terms.customTerms);
      setPageDeclaredSource(item.source?.type === 'PACKPROOF_BUTTON' ? item.source.origin : null);
      setListingImages((item.listingImageReferences ?? []).filter((image) => typeof image.url === 'string' && image.url.startsWith('https://')).slice(0, 6));
      setShowMore(true);
      setLoadingExisting(false);
    }, (error) => { setLoadingExisting(false); Alert.alert('Could not load PackProof', readableError(error)); });
  }, [router, transactionId]);

  const save = async () => {
    if (!valid) { Alert.alert('Check the basics', 'Add an item name and a valid price.'); return; }
    setBusy(true);
    try {
      const parsedIdentifiers = identifiers.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [label, ...rest] = line.split(':');
        return { label: rest.length ? label.trim() : 'Identifier', value: rest.length ? rest.join(':').trim() : label.trim() };
      });
      const result = await callFunction<Record<string, unknown>, { transactionId: string }>('saveTransactionDraft', {
        ...(transactionId ? { transactionId } : {}),
        title: title.trim(), category: category.trim() || 'Collectible', description: description.trim(),
        priceMinor: Math.round(Number(price) * 100), currency, identifiers: parsedIdentifiers,
        conditionNotes: conditionNotes.trim(),
        terms: { saleType, shippingResponsibility: saleType === 'LOCAL_HANDOFF' ? 'NOT_APPLICABLE' : shippingResponsibility, returns, returnWindowDays: Math.max(0, Math.min(365, Number.parseInt(returnWindow || '0', 10) || 0)), customTerms: customTerms.trim() },
      });
      if (transactionId) router.replace(`/transaction/${result.transactionId}`);
      else router.replace(`/transaction/invite/${result.transactionId}`);
    } catch (error) {
      const message = readableError(error);
      Alert.alert(transactionId ? 'Could not update PackProof' : 'Could not create PackProof', message, message.includes('free plan') && featureFlags.billing ? [{ text: 'Not now' }, { text: 'View Pro', onPress: () => router.push('/paywall') }] : undefined);
    } finally { setBusy(false); }
  };

  if (transactionId && loadingExisting) return <LoadingScreen />;

  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <Button label="Close" variant="ghost" onPress={() => router.back()} style={styles.close} />

      {step === 1 && !transactionId ? <>
        <Text style={styles.kicker}>New PackProof</Text>
        <Text style={styles.headline}>What are you doing?</Text>
        <Button label="Selling" onPress={() => { setIntent('SELLING'); setStep(2); }} />
        <Button label="Buying" variant="secondary" onPress={() => setIntent('BUYING')} />
        {intent === 'BUYING' ? <>
          <Text style={styles.body}>If you have an invitation, open it. Otherwise ask the seller to start the PackProof.</Text>
          <Field label="Invitation code" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" placeholder="Paste the code from the seller" />
          <Button label="Open invitation" disabled={inviteCode.trim().length < 4} onPress={() => router.replace({ pathname: '/invite', params: { code: inviteCode.trim() } })} />
        </> : null}
      </> : null}

      {step === 2 || transactionId ? <>
        <Text style={styles.kicker}>{transactionId ? 'Edit details' : 'New PackProof'}</Text>
        <Text style={styles.headline}>What&apos;s the item?</Text>
        {pageDeclaredSource ? <Card style={styles.section}>
          <Text style={styles.sectionTitle}>We found this transaction</Text>
          <Text style={styles.importNotice}>These details came from {pageDeclaredSource}. Check them, then continue.</Text>
          {listingImages.length ? <View style={styles.listingImages}>
            {listingImages.map((image) => (
              <Image key={image.url} source={{ uri: image.url }} style={styles.listingImage} contentFit="cover" accessibilityLabel={image.altText || 'Imported listing image'} />
            ))}
          </View> : null}
        </Card> : null}
        <Field label="Item name" value={title} onChangeText={setTitle} placeholder="Sony A7 Camera" autoCapitalize="sentences" />
        <Field label={`Price (${currency})`} value={price} onChangeText={setPrice} placeholder="1299.00" keyboardType="decimal-pad" />
        <Button label={showMore ? 'Hide extra details' : 'More details'} variant="ghost" onPress={() => setShowMore(!showMore)} />
        {showMore ? <Card style={styles.section}>
          <Field label="Category" value={category} onChangeText={setCategory} placeholder="Collectible, watch, electronics…" />
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="Anything that defines the item." multiline />
          <Field label="Identifiers" value={identifiers} onChangeText={setIdentifiers} placeholder={'Serial: ABC-123'} multiline />
          <Field label="Condition notes" value={conditionNotes} onChangeText={setConditionNotes} placeholder="Visible defects or condition claims." multiline />
          <Text style={styles.label}>How will it change hands?</Text>
          <View style={styles.choices}><Choice label="Shipped" selected={saleType === 'SHIPPED'} onPress={() => setSaleType('SHIPPED')} /><Choice label="Local handoff" selected={saleType === 'LOCAL_HANDOFF'} onPress={() => setSaleType('LOCAL_HANDOFF')} /></View>
          {saleType === 'SHIPPED' ? <><Text style={styles.label}>Who pays shipping?</Text><View style={styles.choices}><Choice label="Seller" selected={shippingResponsibility === 'SELLER'} onPress={() => setShippingResponsibility('SELLER')} /><Choice label="Buyer" selected={shippingResponsibility === 'BUYER'} onPress={() => setShippingResponsibility('BUYER')} /></View></> : null}
          <Text style={styles.label}>Returns</Text>
          <View style={styles.choices}><Choice label="As agreed" selected={returns === 'AS_AGREED'} onPress={() => setReturns('AS_AGREED')} /><Choice label="No returns" selected={returns === 'NO_RETURNS'} onPress={() => setReturns('NO_RETURNS')} /><Choice label="Platform policy" selected={returns === 'PLATFORM_POLICY'} onPress={() => setReturns('PLATFORM_POLICY')} /></View>
          <Field label="Return window in days" value={returnWindow} onChangeText={setReturnWindow} keyboardType="number-pad" />
          <Field label="Additional terms" value={customTerms} onChangeText={setCustomTerms} placeholder="Anything else you both agreed." multiline />
        </Card> : null}
        {transactionId ? <Button label="Save" icon="checkmark.shield.fill" busy={busy} disabled={!valid} onPress={save} /> : <Button label="Continue" disabled={!valid} onPress={() => setStep(3)} />}
      </> : null}

      {step === 3 && !transactionId ? <>
        <Text style={styles.kicker}>New PackProof</Text>
        <Text style={styles.headline}>How should the other person join?</Text>
        <Text style={styles.body}>PackProof will give you a private share link. You can send it by text, email, or any other way you already use.</Text>
        <Card style={styles.summary}>
          <Text style={styles.summaryTitle}>{title.trim() || 'Untitled item'}</Text>
          <Text style={styles.body}>{price ? `$${price}` : 'Price needed'}</Text>
        </Card>
        <Button label="Create PackProof" icon="checkmark.shield.fill" busy={busy} disabled={!valid} onPress={save} />
        <Button label="Back" variant="ghost" onPress={() => setStep(2)} />
      </> : null}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 44, gap: 14 },
  close: { alignSelf: 'flex-start', minHeight: 40 },
  kicker: { color: colors.teal, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  headline: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: 16 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  importNotice: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  listingImages: { gap: 10 },
  listingImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summary: { gap: 6 },
  summaryTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
});
