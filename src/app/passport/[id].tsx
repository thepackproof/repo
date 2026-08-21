import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors, radius } from '@/constants/brand';
import { callFunction } from '@/lib/api';
import { forceFreshCallableCredentials } from '@/lib/firebase';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import type { PackProofPassportView } from '@/types/models';

function Chip({ label, state }: { label: string; state: string }) {
  return <View style={styles.chip}>
    <Text style={styles.chipLabel}>{label.replaceAll('_', ' ')}</Text>
    <Text style={styles.chipState}>{state.replaceAll('_', ' ')}</Text>
  </View>;
}

export default function PackProofPassportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { sessionReady, loading } = useAuth();
  const [passport, setPassport] = useState<PackProofPassportView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !sessionReady && id) {
      router.replace({ pathname: '/welcome', params: { redirect: `/passport/${encodeURIComponent(id)}` } });
    }
  }, [id, loading, router, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !id) return;
    let cancelled = false;
    (async () => {
      try {
        await forceFreshCallableCredentials();
        const looksLikePassport = /^ppt_/.test(id) || /^PP-/i.test(id);
        const result = await callFunction<
          { transactionId?: string; passportId?: string },
          PackProofPassportView
        >('getPackProofPassport', looksLikePassport ? { passportId: id } : { transactionId: id });
        if (!cancelled) setPassport(result);
      } catch (caught) {
        if (!cancelled) setError(readableError(caught));
      }
    })();
    return () => { cancelled = true; };
  }, [id, sessionReady]);

  if (loading || (id && !sessionReady)) return <LoadingScreen />;
  if (!passport && !error) return <LoadingScreen />;

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.container}>
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
      {error ? <Card style={styles.card}>
        <ScreenTitle eyebrow="Proof" title="Not available yet" subtitle={error} />
        <Text style={styles.body}>A live Proof is issued only after a bound transaction has a server-finalized evidence artifact with file and manifest hashes. Missing inventory never makes a Proof inauthentic.</Text>
      </Card> : null}
      {passport ? <>
        <ScreenTitle eyebrow="Proof" title="Your Proof is ready" subtitle={passport.identity.displayId} />
        <Card style={styles.banner}>
          <Text style={styles.bannerTitle}>{passport.integrity.banner.replaceAll('_', ' ')}</Text>
          <Text style={styles.bannerSummary}>{passport.integrity.summary}</Text>
          <Text style={styles.body}>{passport.integrity.meaning}</Text>
        </Card>
        <Card style={styles.card}>
          <Text style={styles.section}>Transaction</Text>
          <Text style={styles.row}>Platform: {passport.transaction.platform.value ?? 'NOT AVAILABLE'}</Text>
          <Text style={styles.row}>Order: {passport.transaction.externalOrderId.value ?? 'NOT AVAILABLE'}</Text>
          <Text style={styles.row}>Date: {passport.transaction.transactionDate.value ?? 'NOT AVAILABLE'}</Text>
          <Text style={styles.row}>Expected item: {passport.items[0]?.expected.title.value ?? 'NOT AVAILABLE'}</Text>
        </Card>
        <Card style={styles.card}>
          <Text style={styles.section}>Expected ↔ observed</Text>
          <Text style={styles.footnote}>Comparisons report relationships between recorded data. They do not establish product authenticity, legal ownership, custody or liability.</Text>
          {(passport.items[0]?.comparisons ?? []).map((item) => (
            <Text key={item.attribute} style={styles.row}>{item.attribute}: {item.result}</Text>
          ))}
        </Card>
        <Card style={styles.card}>
          <Text style={styles.section}>Evidence available</Text>
          <View style={styles.chips}>
            {passport.evidenceInventory.map((entry) => <Chip key={entry.category} label={entry.category} state={entry.state} />)}
          </View>
        </Card>
        <Card style={styles.card}>
          <Text style={styles.section}>Fulfillment</Text>
          <Text style={styles.row}>Packing: {passport.fulfillment.packingArtifactId ?? 'NOT AVAILABLE'}</Text>
          <Text style={styles.row}>Seal: {passport.fulfillment.sealArtifactId ?? 'NOT AVAILABLE'}</Text>
          <Text style={styles.row}>Label: {passport.fulfillment.labelArtifactId ?? 'NOT AVAILABLE'}</Text>
          <Text style={styles.row}>Tracking observed: {passport.fulfillment.trackingObserved.value ?? 'NOT AVAILABLE'}</Text>
        </Card>
        <Card style={styles.qrCard}>
          <QRCode value={passport.identity.qrPayload} size={148} color={colors.ink} backgroundColor={colors.card} />
          <Text style={styles.footnote}>The QR encodes the verification URL. It does not grant access. Sign-in is still required for PII.</Text>
          <Text style={styles.hash}>{passport.identity.verificationUrl}</Text>
        </Card>
        <Text style={styles.footer}>Review the evidence and provenance on the following pages. PackProof does not determine fraud, fault, or liability.</Text>
        <Text style={styles.footer}>{passport.limitations.humanReviewDisclaimer}</Text>
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 14, paddingBottom: 48 },
  card: { gap: 8 },
  banner: { gap: 8, backgroundColor: colors.accent },
  bannerTitle: { color: colors.tealDark, fontSize: 16, fontWeight: '900' },
  bannerSummary: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  section: { color: colors.ink, fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  row: { color: colors.ink, fontSize: 13, lineHeight: 20 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  footnote: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.mutedSurface, minWidth: 140 },
  chipLabel: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  chipState: { color: colors.ink, fontSize: 12, fontWeight: '700', marginTop: 2 },
  qrCard: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  hash: { color: colors.muted, fontSize: 11, fontFamily: 'monospace', textAlign: 'center' },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
