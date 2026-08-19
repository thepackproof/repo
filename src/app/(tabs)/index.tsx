import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { Button, Field } from '@/components/ui';
import { TaskArt } from '@/components/task-art';
import { HomeTaskTile, HomeWaitTile } from '@/components/task-session';
import { transactionUx } from '@/components/transaction-card';
import { colors } from '@/constants/brand';
import { useTransactions } from '@/hooks/use-transactions';
import { useAuth } from '@/providers/auth-provider';
import { useOfflineEvidence } from '@/providers/offline-evidence-provider';
import { queueAttentionMessage } from '@/lib/queue-attention';
import { formatMoney } from '@/lib/format';
import { groupHomeInbox, hrefForPrimaryAction, toHref, viewerRole } from '@/lib/ux-flow';

export default function HomeScreen() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const { items } = useTransactions(user?.uid);
  const { queuedCount, attentionCount, attentionReason, syncNow, retryAttention } = useOfflineEvidence();
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const grouped = user ? groupHomeInbox(items, (item) => transactionUx(item, user.uid)) : {
    needsAttention: [],
    waiting: [],
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.name}>{profile?.displayName?.split(' ')[0] ?? 'Home'}</Text>
          <Pressable onPress={() => router.push('/transaction/new')} style={styles.newButton} accessibilityRole="button" accessibilityLabel="Protect a shipment">
            <AppIcon name="plus" size={20} tintColor={colors.teal} />
          </Pressable>
        </View>

        {queuedCount || attentionCount ? (
          <View style={styles.queue}>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>{attentionCount ? 'Your recording is safe' : 'Saved on this phone'}</Text>
              <Text style={styles.queueText}>
                {attentionCount && attentionReason
                  ? queueAttentionMessage(attentionReason)
                  : 'Uploading when your connection returns. You can leave PackProof.'}
              </Text>
            </View>
            {attentionCount ? <Button label="Retry" variant="secondary" onPress={retryAttention} /> : queuedCount ? <Button label="Sync now" variant="secondary" onPress={syncNow} /> : null}
          </View>
        ) : null}

        {!grouped.needsAttention.length && !grouped.waiting.length ? (
          <View style={styles.empty}>
            <TaskArt kind="box" />
            <Text style={styles.emptyTitle}>Protect a shipment</Text>
            <Text style={styles.emptyBody}>PackProof will tell you the next step. You should not have to hunt for it.</Text>
            <Button label="Protect this shipment" onPress={() => router.push('/transaction/new')} />
            <Pressable onPress={() => setJoinOpen((value) => !value)} accessibilityRole="button">
              <Text style={styles.quietLink}>I have an invite</Text>
            </Pressable>
            {joinOpen ? (
              <View style={styles.join}>
                <Field label="Invitation" value={inviteCode} onChangeText={setInviteCode} autoCapitalize="characters" placeholder="Paste the code" />
                <Button
                  label="Open invitation"
                  disabled={inviteCode.trim().length < 4}
                  onPress={() => router.push({ pathname: '/invite', params: { code: inviteCode.trim() } })}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <>
            {grouped.needsAttention.map((item) => {
              const ux = transactionUx(item, user!.uid);
              const href = ux.primaryAction
                ? hrefForPrimaryAction(ux.primaryAction.kind, item.id)
                : { pathname: '/task/[id]' as const, params: { id: item.id } };
              return (
                <HomeTaskTile
                  key={item.id}
                  identity={`${viewerRole(item, user!.uid) === 'SELLER' ? 'Selling' : 'Buying'} · ${formatMoney(item.priceMinor, item.currency)}`}
                  title={item.title}
                  job={ux.inboxSentence}
                  cta={ux.primaryAction?.label ?? null}
                  onPress={() => router.push(toHref(href))}
                  onCta={() => router.push(toHref(href))}
                />
              );
            })}
            {grouped.waiting.length ? (
              <View style={styles.waiting}>
                {grouped.waiting.map((item) => {
                  const ux = transactionUx(item, user!.uid);
                  return (
                    <HomeWaitTile
                      key={item.id}
                      title={item.title}
                      sentence={ux.inboxSentence}
                      onPress={() => router.push(toHref({ pathname: '/task/[id]', params: { id: item.id } }))}
                    />
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 36, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { color: colors.ink, fontSize: 28, fontWeight: '800' },
  newButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(70,124,99,0.08)', alignItems: 'center', justifyContent: 'center' },
  queue: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: 'rgba(70,124,99,0.08)' },
  queueTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  queueText: { color: colors.muted, fontSize: 13, marginTop: 3, lineHeight: 18 },
  empty: { paddingTop: 28, alignItems: 'stretch', gap: 14 },
  emptyTitle: { color: colors.ink, fontSize: 34, lineHeight: 40, fontWeight: '800', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 17, lineHeight: 24, textAlign: 'center', marginBottom: 8 },
  quietLink: { color: colors.teal, fontSize: 15, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  join: { gap: 10 },
  waiting: { gap: 4, paddingTop: 8 },
});
