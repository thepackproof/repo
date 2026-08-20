import { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Field } from '@/components/ui';
import { TaskSession, HomeTaskTile } from '@/components/task-session';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { startPackProofFromIntake } from '@/lib/api';
import { formatMoney, readableError } from '@/lib/format';
import { formatIntakeSource, fieldNeedsReview, pendingNeedsConfirmation } from '@/lib/transaction-intake';
import { usePendingIntakes } from '@/hooks/use-pending-intakes';
import { useAuth } from '@/providers/auth-provider';

export default function FindOrderScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, loading } = usePendingIntakes(user?.uid);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [variant, setVariant] = useState('');
  const [price, setPrice] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = useMemo(() => items.find((item) => item.commerceContextId === selectedId) ?? null, [items, selectedId]);

  const start = async (commerceContextId: string, confirmed?: { title?: string; variant?: string; priceMinor?: number; orderNumber?: string }) => {
    setBusy(true);
    try {
      const result = await startPackProofFromIntake({ commerceContextId, confirmed });
      router.replace(`/transaction/invite/${result.transactionId}`);
    } catch (error) {
      const message = readableError(error);
      Alert.alert('Could not start this PackProof', message, message.includes('free plan') && featureFlags.billing ? [{ text: 'Not now' }, { text: 'View Pro', onPress: () => router.push('/paywall') }] : undefined);
    } finally {
      setBusy(false);
    }
  };

  const choose = (commerceContextId: string) => {
    const item = items.find((entry) => entry.commerceContextId === commerceContextId);
    if (!item) return;
    if (pendingNeedsConfirmation(item) || item.missingFields.includes('variant')) {
      setSelectedId(item.commerceContextId);
      setTitle(item.title);
      setVariant(item.variant?.replace(/^Variant:\s*/i, '') ?? '');
      setPrice(item.amount ? (item.amount.minorUnits / 100).toFixed(2) : '');
      setOrderNumber(item.orderNumber ?? '');
      return;
    }
    void start(item.commerceContextId);
  };

  const confirm = () => {
    if (!selected) return;
    const priceMinor = Math.round(Number(price) * 100);
    void start(selected.commerceContextId, {
      title: title.trim() || undefined,
      variant: variant.trim() || undefined,
      orderNumber: orderNumber.trim() || undefined,
      priceMinor: Number.isFinite(priceMinor) && price.trim() ? priceMinor : undefined,
    });
  };

  if (selected) {
    return (
      <TaskSession
        title="Confirm a few details"
        sentence="PackProof filled these from the receipt. Check anything that looks guessed, then continue."
        onClose={() => setSelectedId(null)}
        closeLabel="Back"
        align="start"
        primary={{ label: 'Protect this shipment', busy, disabled: !title.trim(), onPress: confirm }}
      >
        {fieldNeedsReview(selected, 'title') ? <Field label="Item name" value={title} onChangeText={setTitle} placeholder="Sony A7 Camera" autoCapitalize="sentences" /> : <Text style={styles.item}>{selected.title}</Text>}
        {fieldNeedsReview(selected, 'variant') ? <Field label="Variant" value={variant} onChangeText={setVariant} placeholder="Size, color, bundle…" /> : null}
        {fieldNeedsReview(selected, 'price') ? <Field label="Price" value={price} onChangeText={setPrice} placeholder="1299.00" keyboardType="decimal-pad" /> : null}
        {fieldNeedsReview(selected, 'orderNumber') ? <Field label="Order number" value={orderNumber} onChangeText={setOrderNumber} placeholder="Optional" autoCapitalize="characters" /> : null}
      </TaskSession>
    );
  }

  return (
    <TaskSession
      title="Find my order"
      sentence="Pick a purchase PackProof already imported, or bring one in."
      onClose={() => router.back()}
      align="start"
      primary={{ label: 'Import a receipt', onPress: () => router.push('/transaction/import') }}
      secondary={{ label: 'Enter details myself', onPress: () => router.push('/transaction/new') }}
    >
      {loading ? <Text style={styles.muted}>Looking for imported purchases…</Text> : null}
      {!loading && !items.length ? <Text style={styles.muted}>Share a sold email, screenshot, or PDF to PackProof and it will show up here.</Text> : null}
      {items.map((item) => (
        <HomeTaskTile
          key={item.commerceContextId}
          identity={`${formatIntakeSource(item.intakeSourceType)}${item.platformIdentifier ? ` · ${item.platformIdentifier}` : ''}${item.amount ? ` · ${formatMoney(item.amount.minorUnits, item.amount.currency)}` : ''}`}
          title={item.title}
          job={item.orderNumber ? `Order ${item.orderNumber}` : 'Imported purchase'}
          cta="Protect this shipment"
          onPress={() => choose(item.commerceContextId)}
          onCta={() => choose(item.commerceContextId)}
        />
      ))}
      {busy ? <View style={styles.busy} /> : null}
    </TaskSession>
  );
}

const styles = StyleSheet.create({
  muted: { color: colors.muted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  item: { color: colors.ink, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  busy: { height: 0 },
});
