import { useState } from 'react';
import { Alert, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { BrandIcon, BrandLockup } from '@/components/brand-lockup';
import { Button, LoadingScreen } from '@/components/ui';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { CURRENT_POLICY_EFFECTIVE_DATE, LEGAL_BASE_URL } from '@/constants/legal';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function WelcomeScreen() {
  const { user, sessionReady, loading, signInGoogle, signInFacebook, signInTikTok, acceptCurrentPolicies, signOut } = useAuth();
  const { invite, redirect } = useLocalSearchParams<{ invite?: string; redirect?: string }>();
  const safeRedirect = typeof redirect === 'string' && (
    redirect.startsWith('/connect/capture?')
    || redirect.startsWith('/handoff/review?')
    || redirect.startsWith('/claim/participant?')
    || redirect.startsWith('/evidence-session/redeem?')
    || redirect.startsWith('/invite?')
    || redirect.startsWith('/portal/open?')
    || redirect.startsWith('/transaction/import')
    || redirect.startsWith('/passport/')
  ) ? redirect : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  if (loading) return <LoadingScreen />;
  if (sessionReady) return <Redirect href={safeRedirect ? safeRedirect as Href : invite ? { pathname: '/invite', params: { code: invite } } : '/(tabs)'} />;

  const run = async (provider: string, action: () => Promise<void>) => {
    setBusy(provider);
    try {
      await action();
    } catch (error) { Alert.alert('Could not continue', readableError(error)); } finally { setBusy(null); }
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
          <View style={styles.consentRow}>
            <Switch accessibilityLabel="I agree to the Terms of Use and acknowledge the Privacy Policy" value={agreed} onValueChange={setAgreed} trackColor={{ false: colors.border, true: colors.teal }} />
            <Text style={styles.legal}>I agree to the <Text style={styles.link} onPress={() => Linking.openURL(`${LEGAL_BASE_URL}/terms.html`)}>Terms of Use</Text> and acknowledge the <Text style={styles.link} onPress={() => Linking.openURL(`${LEGAL_BASE_URL}/privacy.html`)}>Privacy Policy</Text>, effective {CURRENT_POLICY_EFFECTIVE_DATE}. Section 23 of the Terms contains binding arbitration and a class-action waiver with a 30-day opt-out.</Text>
          </View>
          {user
            ? <>
              <Button label="Agree and Continue" disabled={!agreed} busy={busy === 'legal'} onPress={() => run('legal', acceptCurrentPolicies)} />
              <Button label="Sign out" variant="ghost" busy={busy === 'signout'} onPress={() => run('signout', signOut)} />
            </>
            : <>
              <Button label="Continue with Google" icon="globe" disabled={!agreed} busy={busy === 'google'} onPress={() => run('google', () => signInGoogle(false, true))} />
              {featureFlags.facebookAuth ? <Button label="Continue with Facebook" icon="person.2.fill" variant="secondary" disabled={!agreed} busy={busy === 'facebook'} onPress={() => run('facebook', () => signInFacebook(false, true))} /> : null}
              {featureFlags.tiktokAuth ? <Button label="Continue with TikTok" icon="music.note" variant="secondary" disabled={!agreed} busy={busy === 'tiktok'} onPress={() => run('tiktok', () => signInTikTok(true))} /> : null}
            </>}
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
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  legal: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  link: { color: colors.teal, fontWeight: '800', textDecorationLine: 'underline' },
});
