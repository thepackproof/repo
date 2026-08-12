import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { callFunction } from '@/lib/api';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function PublicCommerceHandoffReview() {
  const { handoff, token } = useLocalSearchParams<{ handoff?: string; token?: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [redeeming, setRedeeming] = useState(false);
  const valid = Boolean(handoff && token);

  useEffect(() => {
    if (!loading && !user && valid) {
      router.replace({ pathname: '/welcome', params: { redirect: `/handoff/review?handoff=${encodeURIComponent(handoff!)}&token=${encodeURIComponent(token!)}` } });
    }
  }, [handoff, loading, router, token, user, valid]);

  const review = async () => {
    if (!handoff || !token) return;
    setRedeeming(true);
    try {
      const result = await callFunction<
        { handoffId: string; token: string },
        { transactionId: string; publicHandoffId: string; commerceContextId: string; passportDraftId: string }
      >('redeemPublicCommerceHandoff', { handoffId: handoff, token });
      router.replace({ pathname: '/transaction/new', params: { transactionId: result.transactionId } });
    } catch (error) {
      Alert.alert('Could not import this listing', readableError(error));
    } finally {
      setRedeeming(false);
    }
  };

  if (loading || (valid && !user)) return <LoadingScreen />;
  return <SafeAreaView style={styles.safe}>
    <View style={styles.container}>
      <ScreenTitle
        eyebrow="PackProof Button"
        title="Import listing details"
        subtitle="PackProof can create an editable passport draft from the structured item information declared by this storefront."
      />
      <Card style={styles.card}>
        <AppIcon name="doc.badge.plus" size={42} tintColor={colors.teal} />
        <Text style={styles.title}>{valid ? 'Listing handoff ready' : 'Invalid handoff link'}</Text>
        <Text style={styles.body}>{valid
          ? 'The imported title, description, price, identifiers, options, and image references are page-declared context—not a verified order, payment, condition, authenticity, or evidence result. You will review and edit the draft before using it.'
          : 'This link is incomplete or was altered. Return to the listing and click its PackProof button again.'}</Text>
      </Card>
      <Button label="Review imported draft" icon="pencil" disabled={!valid} busy={redeeming} onPress={review} />
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
