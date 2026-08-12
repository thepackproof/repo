import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { getMyEvidenceSession } from '@/lib/api';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function EvidenceSessionRedemptionScreen() {
  const { session, token } = useLocalSearchParams<{ session?: string; token?: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [operationKey] = useState(() => `native_${Crypto.randomUUID()}`);
  const valid = Boolean(session && token);

  useEffect(() => {
    if (!loading && !user && valid) {
      router.replace({ pathname: '/welcome', params: { redirect: `/evidence-session/redeem?session=${encodeURIComponent(session!)}&token=${encodeURIComponent(token!)}` } });
    }
  }, [loading, router, session, token, user, valid]);

  const begin = async () => {
    if (!session || !token) return;
    setOpening(true);
    try {
      const evidenceSession = await getMyEvidenceSession(session);
      const common = {
        id: evidenceSession.transactionId,
        evidenceSessionId: session,
        evidenceSessionToken: token,
        evidenceSessionOperationKey: operationKey,
      };
      if (evidenceSession.type === 'PHYSICAL_REFERENCE' || evidenceSession.type === 'PHYSICAL_VERIFICATION') {
        router.replace({
          pathname: '/capture/physical/[id]',
          params: {
            ...common,
            intent: evidenceSession.type === 'PHYSICAL_REFERENCE' ? 'REFERENCE' : 'VERIFICATION',
            evidenceCaptureGroupId: evidenceSession.captureGroupId ?? '',
          },
        });
        return;
      }
      router.replace({
        pathname: '/capture/[id]',
        params: { ...common, type: evidenceSession.allowedArtifactTypes[0] ?? 'CONDITION_PHOTO' },
      });
    } catch (error) {
      Alert.alert('Could not open capture authorization', readableError(error));
    } finally {
      setOpening(false);
    }
  };

  if (loading || (valid && !user)) return <LoadingScreen />;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.container}>
      <ScreenTitle
        eyebrow="Authorized evidence session"
        title="Open secure capture"
        subtitle="PackProof will verify your identity, App Check context, role, session purpose, expiry, and permitted evidence type before issuing the native capture nonce."
      />
      <Card style={styles.card}>
        <AppIcon name="checkmark.shield.fill" size={42} tintColor={colors.teal} />
        <Text style={styles.title}>{valid ? 'Capture authorization ready' : 'Invalid capture link'}</Text>
        <Text style={styles.body}>{valid
          ? 'This authorization permits a bounded evidence capture. It does not prove the item description, condition, authenticity, purchase, custody, or physical correspondence.'
          : 'This capture link is incomplete or was altered. Ask the merchant for a new evidence session.'}</Text>
      </Card>
      <Button label="Continue to secure capture" icon="camera.fill" disabled={!valid} busy={opening} onPress={begin} />
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
