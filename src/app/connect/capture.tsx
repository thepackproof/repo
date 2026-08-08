import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { callFunction } from '@/lib/api';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function ConnectCaptureHandoff() {
  const { session, token } = useLocalSearchParams<{ session?: string; token?: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [redeeming, setRedeeming] = useState(false);
  const valid = Boolean(session && token);

  useEffect(() => {
    if (!loading && !user && valid) router.replace({ pathname: '/welcome', params: { redirect: `/connect/capture?session=${encodeURIComponent(session!)}&token=${encodeURIComponent(token!)}` } });
  }, [loading, user, valid, router, session, token]);

  const begin = async () => {
    if (!session || !token) return;
    setRedeeming(true);
    try {
      const result = await callFunction<{ sessionId: string; token: string }, { transactionId: string; connectSessionId: string }>('redeemConnectSession', { sessionId: session, token });
      router.replace({ pathname: '/capture/[id]', params: { id: result.transactionId, type: 'PACKING_VIDEO', connectSessionId: result.connectSessionId } });
    } catch (error) {
      Alert.alert('Could not open this order', readableError(error));
    } finally {
      setRedeeming(false);
    }
  };

  if (loading || (valid && !user)) return <LoadingScreen />;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.container}>
      <ScreenTitle eyebrow="PackProof Connect" title="Verify this marketplace order" subtitle="The order context will be locked to a native PackProof capture and returned to the originating platform automatically." />
      <Card style={styles.card}>
        <SymbolView name="link.badge.plus" size={42} tintColor={colors.teal} />
        <Text style={styles.title}>{valid ? 'Secure order handoff ready' : 'Invalid handoff link'}</Text>
        <Text style={styles.body}>{valid ? 'Continue to the guided Pack → Seal & Bridge → Macro-Snap evidence flow. No order details need to be retyped.' : 'This link is incomplete or was altered. Open the original link from the marketplace or seller dashboard.'}</Text>
      </Card>
      <Button label="Begin verified capture" icon="camera.fill" disabled={!valid} busy={redeeming} onPress={begin} />
      <Button label="Cancel" variant="ghost" onPress={() => router.replace('/(tabs)')} />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: 20, justifyContent: 'center', gap: 16 },
  card: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
});
