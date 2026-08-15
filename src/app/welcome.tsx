import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { BrandIcon, BrandLockup } from '@/components/brand-lockup';
import { Button } from '@/components/ui';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function WelcomeScreen() {
  const { user, signInGoogle, signInFacebook, signInTikTok } = useAuth();
  const { invite, redirect } = useLocalSearchParams<{ invite?: string; redirect?: string }>();
  const safeRedirect = typeof redirect === 'string' && (
    redirect.startsWith('/connect/capture?')
    || redirect.startsWith('/handoff/review?')
    || redirect.startsWith('/claim/participant?')
    || redirect.startsWith('/evidence-session/redeem?')
    || redirect.startsWith('/invite?')
  ) ? redirect : null;
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (user) return <Redirect href={safeRedirect ? safeRedirect as Href : invite ? { pathname: '/invite', params: { code: invite } } : '/(tabs)'} />;

  const run = async (provider: string, action: () => Promise<void>) => {
    setBusy(provider);
    try {
      await action();
      if (safeRedirect) router.replace(safeRedirect as Href);
      else if (invite) router.replace({ pathname: '/invite', params: { code: invite } });
      else router.replace('/(tabs)');
    } catch (error) { Alert.alert('Could not sign in', readableError(error)); } finally { setBusy(null); }
  };

  return <SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <BrandIcon style={styles.logo} />
        <BrandLockup />
        <Text style={styles.title}>A shared record from packing through arrival.</Text>
        <Text style={styles.body}>Create a private, review-ready record of the item, the confirmed terms, packing, arrival, and return. PackProof organizes evidence; it does not decide disputes.</Text>
      </View>

      <View style={styles.features}>
        {([
          ['lock.shield.fill', 'Locked terms', 'Both parties confirm one version before fulfillment.'],
          ['video.fill', 'Guided capture', 'Packing, the visible PP mark, and arrival observations stay connected to the transaction.'],
          ['doc.text.fill', 'Exportable packet', 'Server receipt times, file hashes, and the audit timeline in one presentation dossier.'],
        ] satisfies [AppIconName, string, string][]).map(([icon, title, body]) => <View key={title} style={styles.feature}>
          <View style={styles.featureIcon}><AppIcon name={icon} size={20} tintColor={colors.teal} /></View>
          <View style={{ flex: 1 }}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureBody}>{body}</Text></View>
        </View>)}
      </View>

      <View style={styles.buttons}>
        <Button label="Continue with Google" icon="globe" busy={busy === 'google'} onPress={() => run('google', () => signInGoogle())} />
        {featureFlags.facebookAuth ? <Button label="Continue with Facebook" icon="person.2.fill" variant="secondary" busy={busy === 'facebook'} onPress={() => run('facebook', () => signInFacebook())} /> : null}
        {featureFlags.tiktokAuth ? <Button label="Continue with TikTok" icon="music.note" variant="secondary" busy={busy === 'tiktok'} onPress={() => run('tiktok', signInTikTok)} /> : null}
      </View>
      <Text style={styles.legal}>By continuing, you agree to PackProof’s Terms and Privacy Policy. PackProof documents evidence; it does not authenticate items, insure shipments, provide escrow or decide disputes.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, gap: 28 },
  hero: { alignItems: 'center', gap: 10 },
  logo: { width: 92, height: 92, marginBottom: -12 },
  title: { color: colors.ink, fontSize: 32, lineHeight: 37, letterSpacing: -0.9, fontWeight: '900', textAlign: 'center', maxWidth: 400 },
  body: { color: colors.muted, textAlign: 'center', lineHeight: 22, fontSize: 15, maxWidth: 430 },
  features: { gap: 10 },
  feature: { flexDirection: 'row', gap: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 15 },
  featureIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(70,124,99,0.10)', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 3 },
  featureBody: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  buttons: { gap: 10 },
  legal: { color: colors.muted, opacity: 0.8, fontSize: 10, lineHeight: 15, textAlign: 'center' },
});
