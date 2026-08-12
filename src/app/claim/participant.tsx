import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { claimParticipantInvitation } from '@/lib/api';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function ParticipantClaimScreen() {
  const { claim, token } = useLocalSearchParams<{ claim?: string; token?: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const valid = Boolean(claim && token);

  useEffect(() => {
    if (!loading && !user && valid) {
      router.replace({ pathname: '/welcome', params: { redirect: `/claim/participant?claim=${encodeURIComponent(claim!)}&token=${encodeURIComponent(token!)}` } });
    }
  }, [claim, loading, router, token, user, valid]);

  const accept = async () => {
    if (!claim || !token) return;
    setClaiming(true);
    try {
      const result = await claimParticipantInvitation(claim, token);
      router.replace({ pathname: '/transaction/[id]', params: { id: result.transactionId } });
    } catch (error) {
      Alert.alert('Could not claim this role', readableError(error));
    } finally {
      setClaiming(false);
    }
  };

  if (loading || (valid && !user)) return <LoadingScreen />;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.container}>
      <ScreenTitle
        eyebrow="Participant claim"
        title="Join this PackProof"
        subtitle="Your signed-in PackProof identity will be bound to one specific transaction role only after you accept."
      />
      <Card style={styles.card}>
        <AppIcon name="person.badge.plus" size={42} tintColor={colors.teal} />
        <Text style={styles.title}>{valid ? 'Invitation ready for review' : 'Invalid invitation link'}</Text>
        <Text style={styles.body}>{valid
          ? 'The merchant reference in this invitation is only a label. It does not authenticate you. PackProof uses this one-time invitation together with your signed-in identity and App Check before granting participant access.'
          : 'This invitation is incomplete or was altered. Ask the merchant for a new participant invitation.'}</Text>
      </Card>
      <Button label="Accept participant role" icon="checkmark.shield.fill" disabled={!valid} busy={claiming} onPress={accept} />
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
