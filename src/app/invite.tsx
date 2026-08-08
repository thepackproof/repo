import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { callFunction } from '@/lib/api';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function AcceptInvite() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href={{ pathname: '/welcome', params: code ? { invite: code } : {} }} />;
  const accept = async () => {
    if (!code) return;
    setBusy(true);
    try { const result = await callFunction<{ code: string }, { transactionId: string }>('acceptInvite', { code }); router.replace(`/transaction/${result.transactionId}`); }
    catch (error) { Alert.alert('Invitation unavailable', readableError(error)); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={styles.safe}><View style={styles.container}>
    <ScreenTitle eyebrow="Buyer invitation" title="Review before you confirm" subtitle="Joining reveals the proposed item details and terms. Nothing is locked until both you and the seller confirm the same version." />
    <Card style={styles.card}><Text style={styles.title}>What PackProof does</Text><Text style={styles.body}>It connects condition, agreement, packing, shipment and unboxing evidence to one private transaction timeline.</Text></Card>
    <Card style={styles.card}><Text style={styles.title}>What it does not do</Text><Text style={styles.body}>It does not authenticate the seller or merchandise, hold money, insure the shipment, or guarantee recovery after a dispute.</Text></Card>
    <Button label="Join and review terms" icon="person.badge.plus" busy={busy} disabled={!code} onPress={accept} />
    <Button label="Decline" variant="ghost" onPress={() => router.replace('/(tabs)')} />
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, container: { flex: 1, padding: 22, justifyContent: 'center', gap: 14 }, card: { gap: 7 }, title: { color: colors.ink, fontSize: 16, fontWeight: '900' }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 } });
