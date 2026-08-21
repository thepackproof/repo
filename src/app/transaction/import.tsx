import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, Text } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Field, LoadingScreen } from '@/components/ui';
import { TaskSession } from '@/components/task-session';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { ingestTransactionIntake, previewTransactionIntake, startPackProofFromIntake, type ConsumerIntakeSourceType, type IntakePreview } from '@/lib/api';
import { readableError } from '@/lib/format';
import { confirmedFromPreview, fieldNeedsReview, hashFileArtifact, intakeSourceForShare, readTextArtifact, sha256Utf8 } from '@/lib/transaction-intake';
import { useAuth } from '@/providers/auth-provider';

export default function ImportPurchaseScreen() {
  const router = useRouter();
  const { sessionReady, loading } = useAuth();
  const [artifactText, setArtifactText] = useState('');
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [title, setTitle] = useState('');
  const [variant, setVariant] = useState('');
  const [price, setPrice] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [binaryHash, setBinaryHash] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<ConsumerIntakeSourceType>('SHARE_SHEET');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !sessionReady) {
      router.replace({ pathname: '/welcome', params: { redirect: '/transaction/import' } });
    }
  }, [loading, router, sessionReady]);

  const parsedReady = Boolean(preview || title.trim().length > 2 || binaryHash);
  const missing = preview?.missingFields ?? (title.trim() ? [] : ['title']);
  const review = preview ?? { missingFields: missing, heuristicFields: [] as string[] };
  const valid = useMemo(() => title.trim().length > 2 || Boolean(preview?.title), [preview?.title, title]);

  const applyPreview = (next: IntakePreview) => {
    setPreview(next);
    setTitle((value) => value || next.title || '');
    setVariant((value) => value || next.variant || '');
    setOrderNumber((value) => value || next.orderNumber || '');
    if (!price && next.amount) setPrice((next.amount.minorUnits / 100).toFixed(2));
  };

  const lookUp = async (text: string, intakeSourceType: ConsumerIntakeSourceType) => {
    setBusy(true);
    try {
      const next = await previewTransactionIntake({ artifactText: text, intakeSourceType });
      applyPreview(next);
      setSourceType(intakeSourceType);
    } catch (error) {
      Alert.alert('Could not read this purchase', readableError(error));
    } finally {
      setBusy(false);
    }
  };

  const importText = async () => {
    const text = artifactText.trim();
    if (!text) {
      Alert.alert('Paste the receipt', 'Paste the sold email or order text, or import a file.');
      return;
    }
    await lookUp(text, intakeSourceForShare('text/plain', text));
  };

  const importFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/html', 'message/rfc822', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const text = await readTextArtifact(asset.uri);
    const intakeSourceType = intakeSourceForShare(asset.mimeType, text);
    setSourceType(intakeSourceType);
    if (text) {
      setArtifactText(text);
      setBinaryHash(null);
      await lookUp(text, intakeSourceType);
      return;
    }
    setBusy(true);
    try {
      setBinaryHash(await hashFileArtifact(asset.uri));
      setArtifactText('');
      setPreview(null);
    } catch (error) {
      Alert.alert('Could not import this file', readableError(error));
    } finally {
      setBusy(false);
    }
  };

  const importPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    try {
      setBinaryHash(await hashFileArtifact(result.assets[0].uri));
      setArtifactText('');
      setPreview(null);
      setSourceType('SCREENSHOT_IMPORT');
    } catch (error) {
      Alert.alert('Could not import this screenshot', readableError(error));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!valid) {
      Alert.alert('Add the item name', 'PackProof could not determine the item from this correspondence.');
      return;
    }
    setBusy(true);
    try {
      const text = artifactText.trim() || null;
      const originalArtifactSha256 = text ? await sha256Utf8(text) : binaryHash;
      if (!originalArtifactSha256) {
        Alert.alert('Import the receipt first', 'Paste text, a file, or a screenshot before continuing.');
        return;
      }
      const confirmed = confirmedFromPreview(preview ?? {
        parserVersion: 'CONFIRMED_FIELDS_V1',
        platformIdentifier: null,
        title: title.trim(),
        variant: variant.trim() || null,
        quantity: 1,
        amount: null,
        orderNumber: orderNumber.trim() || null,
        sku: null,
        missingFields: [],
        heuristicFields: [],
      }, { title, variant, price, orderNumber });
      const ingested = await ingestTransactionIntake({
        operationKey: originalArtifactSha256,
        intakeSourceType: sourceType,
        originalArtifactSha256,
        artifactText: text,
        confirmed,
      });
      const started = await startPackProofFromIntake({
        commerceContextId: ingested.commerceContextId,
        confirmed,
      });
      router.replace(`/transaction/invite/${started.transactionId}`);
    } catch (error) {
      const message = readableError(error);
      Alert.alert('Could not import this purchase', message, message.includes('free plan') && featureFlags.billing ? [{ text: 'Not now' }, { text: 'View Pro', onPress: () => router.push('/paywall') }] : undefined);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !sessionReady) return <LoadingScreen />;

  return (
    <TaskSession
      title="Import a purchase"
      sentence="Share a sold email, paste the order, or attach a screenshot. PackProof fills what it can."
      onClose={() => router.back()}
      align="start"
      primary={{ label: parsedReady ? 'Protect this shipment' : 'Find order details', busy, disabled: parsedReady ? !valid : artifactText.trim().length < 8 && !binaryHash, onPress: () => { void (parsedReady ? save() : importText()); } }}
      secondary={{ label: 'Choose a file or photo', onPress: () => {
        Alert.alert('Import from this phone', Platform.OS === 'android' ? 'Use a receipt, PDF, or screenshot.' : 'Use a receipt or PDF.', [
          { text: 'File', onPress: () => { void importFile(); } },
          { text: 'Photo', onPress: () => { void importPhoto(); } },
          { text: 'Cancel', style: 'cancel' },
        ]);
      } }}
    >
      <Field
        label="Receipt or order text"
        value={artifactText}
        onChangeText={setArtifactText}
        placeholder="Paste the sold email or order details"
        multiline
        autoCapitalize="sentences"
      />
      {binaryHash ? <Text style={styles.note}>Screenshot or PDF attached. Add the item name if PackProof could not read it.</Text> : null}
      {parsedReady ? (
        <>
          <Field label={fieldNeedsReview(review, 'title') ? 'Item name (please confirm)' : 'Item name'} value={title} onChangeText={setTitle} placeholder="Sony A7 Camera" autoCapitalize="sentences" />
          {fieldNeedsReview(review, 'variant') || variant ? <Field label={fieldNeedsReview(review, 'variant') ? 'Variant (please confirm)' : 'Variant'} value={variant} onChangeText={setVariant} placeholder="Size, color, bundle…" /> : null}
          {fieldNeedsReview(review, 'price') || price ? <Field label={fieldNeedsReview(review, 'price') ? 'Price (please confirm)' : 'Price'} value={price} onChangeText={setPrice} placeholder="1299.00" keyboardType="decimal-pad" /> : null}
          {fieldNeedsReview(review, 'orderNumber') || orderNumber ? <Field label={fieldNeedsReview(review, 'orderNumber') ? 'Order number (please confirm)' : 'Order number'} value={orderNumber} onChangeText={setOrderNumber} placeholder="Optional" autoCapitalize="characters" /> : null}
        </>
      ) : null}
    </TaskSession>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
});
