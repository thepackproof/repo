import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon, type AppIconName } from '@/components/app-icon';
import { Button, Card, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { featureFlags } from '@/constants/features';
import { callFunction, downloadUrl } from '@/lib/api';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { LEGAL_BASE_URL } from '@/constants/legal';
import { usePurchases } from '@/providers/purchases-provider';

function ProviderRow({ name, icon, linked, onPress, busy }: { name: string; icon: AppIconName; linked: boolean; onPress: () => void; busy: boolean }) {
  return <View style={styles.provider}>
    <View style={styles.providerIcon}><AppIcon name={icon} size={19} tintColor={linked ? colors.teal : colors.muted} /></View>
    <Text style={styles.providerName}>{name}</Text>
    {linked ? <View style={styles.linked}><Text style={styles.linkedText}>LINKED</Text></View> : <Button label="Link" variant="ghost" busy={busy} onPress={onPress} style={{ minHeight: 38, paddingHorizontal: 13 }} />}
  </View>;
}

export default function AccountScreen() {
  const router = useRouter();
  const { user, profile, signInGoogle, signInFacebook, signInTikTok, refreshAuthentication, refreshProfile, signOut } = useAuth();
  const { managementUrl, available: billingAvailable } = usePurchases();
  const [busy, setBusy] = useState<string | null>(null);
  const providers = new Set([...(profile?.providers ?? []), ...(user?.providerData.map((item) => item.providerId) ?? [])]);

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try { await action(); } catch (error) { Alert.alert('Could not complete that', readableError(error)); } finally { setBusy(null); }
  };

  const exportData = () => run('export', async () => {
    const result = await callFunction<Record<string, never>, { storagePath: string }>('exportAccountData', {});
    await Linking.openURL(await downloadUrl(result.storagePath));
  });

  const deleteAccount = () => Alert.alert(
    'Schedule account deletion?',
    'You will have seven days to cancel. Your personal profile and uploaded evidence will then be removed; shared transaction records will be redacted.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: () => run('delete', async () => {
      await refreshAuthentication();
      await callFunction<{ confirmation: string }, { scheduledAt: string }>('requestAccountDeletion', { confirmation: 'DELETE' });
      Alert.alert('Deletion scheduled', 'Sign in within seven days if you need to cancel the request.');
      await signOut();
    }) }],
  );

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.container}>
    <ScreenTitle eyebrow="Security & access" title="Account" subtitle={featureFlags.billing ? 'Control linked sign-in methods, your subscription and your PackProof data.' : 'Control linked sign-in methods and your PackProof data.'} />
    <Card style={styles.identity}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.displayName ?? user?.displayName ?? 'P').slice(0, 1).toUpperCase()}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.name}>{profile?.displayName ?? user?.displayName ?? 'PackProof member'}</Text><Text style={styles.email}>{profile?.email ?? user?.email ?? 'Social sign-in account'}</Text></View>
      {featureFlags.billing ? <View style={styles.plan}><Text style={styles.planText}>{profile?.plan ?? 'FREE'}</Text></View> : null}
    </Card>
    {profile?.deletionScheduledAt ? <Card style={styles.deletionNotice}>
      <Text style={styles.deletionTitle}>Account deletion is scheduled</Text>
      <Text style={styles.deletionText}>Cancel within the seven-day grace period to keep your account and evidence.</Text>
      <Button label="Cancel account deletion" busy={busy === 'cancel-delete'} onPress={() => run('cancel-delete', async () => { await callFunction('cancelAccountDeletion', {}); await refreshProfile(); })} />
    </Card> : null}

    <Text style={styles.sectionLabel}>LINKED ACCOUNTS</Text>
    <Card style={styles.providers}>
      <ProviderRow name="Google" icon="globe" linked={providers.has('google.com')} busy={busy === 'google'} onPress={() => run('google', () => signInGoogle(true))} />
      {featureFlags.facebookAuth ? <ProviderRow name="Facebook" icon="person.2.fill" linked={providers.has('facebook.com')} busy={busy === 'facebook'} onPress={() => run('facebook', () => signInFacebook(true))} /> : null}
      {featureFlags.tiktokAuth ? <ProviderRow name="TikTok" icon="music.note" linked={providers.has('tiktok.com')} busy={busy === 'tiktok'} onPress={() => run('tiktok', signInTikTok)} /> : null}
    </Card>

    <Text style={styles.sectionLabel}>PLAN & DATA</Text>
    <View style={styles.actions}>
      {billingAvailable ? <Button label={profile?.plan === 'PRO' ? 'Manage PackProof Pro' : 'Upgrade to PackProof Pro'} icon="star.fill" variant="secondary" onPress={() => managementUrl ? Linking.openURL(managementUrl) : router.push('/paywall')} /> : null}
      <Button label="Export account record (JSON)" icon="square.and.arrow.up" variant="secondary" busy={busy === 'export'} onPress={exportData} />
      <Button label="Privacy policy" variant="ghost" onPress={() => Linking.openURL(`${LEGAL_BASE_URL}/privacy.html`)} />
      <Button label="Terms of use" variant="ghost" onPress={() => Linking.openURL(`${LEGAL_BASE_URL}/terms.html`)} />
      <Button label="Sign out" variant="ghost" onPress={signOut} />
    </View>

    <Text style={styles.sectionLabel}>DANGER ZONE</Text>
    <Button label="Delete my account and data" icon="trash.fill" variant="danger" busy={busy === 'delete'} onPress={deleteAccount} />
    <Text style={styles.version}>PackProof 0.9.5.0</Text>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 40 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 24 },
  avatar: { width: 50, height: 50, borderRadius: 18, backgroundColor: 'rgba(70,124,99,0.1)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.teal, fontSize: 21, fontWeight: '900' }, name: { color: colors.ink, fontSize: 17, fontWeight: '900' }, email: { color: colors.muted, fontSize: 12, marginTop: 3 },
  plan: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(70,124,99,0.1)' }, planText: { color: colors.teal, fontSize: 10, fontWeight: '900' },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 9, marginTop: 8 },
  providers: { paddingVertical: 5, marginBottom: 22 }, provider: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11 }, providerIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, providerName: { flex: 1, color: colors.ink, fontWeight: '800' },
  linked: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(70,124,99,0.08)' }, linkedText: { color: colors.teal, fontSize: 9, fontWeight: '900' },
  actions: { gap: 9, marginBottom: 24 }, version: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 18 },
  deletionNotice: { gap: 10, marginBottom: 22, backgroundColor: 'rgba(138,91,0,0.06)' }, deletionTitle: { color: colors.amber, fontSize: 15, fontWeight: '900' }, deletionText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
});
