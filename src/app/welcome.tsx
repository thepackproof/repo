import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
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

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.hero}>
          <BrandIcon style={styles.logo} />
          <BrandLockup />
          <Text style={styles.title}>Protect a shipment without extra chores.</Text>
        </View>
        <View style={styles.buttons}>
          <Button label="Continue with Google" icon="globe" busy={busy === 'google'} onPress={() => run('google', () => signInGoogle())} />
          {featureFlags.facebookAuth ? <Button label="Continue with Facebook" icon="person.2.fill" variant="secondary" busy={busy === 'facebook'} onPress={() => run('facebook', () => signInFacebook())} /> : null}
          {featureFlags.tiktokAuth ? <Button label="Continue with TikTok" icon="music.note" variant="secondary" busy={busy === 'tiktok'} onPress={() => run('tiktok', signInTikTok)} /> : null}
          <Text style={styles.legal}>By continuing, you agree to PackProof’s Terms and Privacy Policy.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 36, paddingBottom: 24, justifyContent: 'space-between' },
  hero: { alignItems: 'center', gap: 12, paddingTop: 48 },
  logo: { width: 92, height: 92, marginBottom: -8 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, fontWeight: '800', textAlign: 'center', maxWidth: 340 },
  buttons: { gap: 10 },
  legal: { color: colors.muted, opacity: 0.8, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 6 },
});
