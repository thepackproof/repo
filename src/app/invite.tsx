import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Button, LoadingScreen, ScreenTitle } from '@/components/ui';
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
    <ScreenTitle eyebrow="Invitation" title="Confirm the transaction" subtitle="Join to see the item, price, and terms. Nothing is locked until you confirm." />
    <Button label="Continue" icon="person.badge.plus" busy={busy} disabled={!code} onPress={accept} />
    <Button label="Decline" variant="ghost" onPress={() => router.replace('/(tabs)')} />
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, container: { flex: 1, padding: 22, justifyContent: 'center', gap: 14 } });
