import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Button, Card, LoadingScreen, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { callFunction } from '@/lib/api';
import { readableError } from '@/lib/format';

export default function InviteBuyer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  useEffect(() => { if (id) callFunction<{ transactionId: string }, { url: string; expiresAt: string }>('createInvite', { transactionId: id }).then(setInvite).catch((error) => { Alert.alert('Could not create invitation', readableError(error)); router.back(); }); }, [id, router]);
  if (!invite) return <LoadingScreen />;
  return <SafeAreaView style={styles.safe}><View style={styles.container}>
    <Button label="Close" variant="ghost" onPress={() => router.back()} style={styles.close} />
    <ScreenTitle eyebrow="Private invitation" title="Invite your buyer" subtitle="Only the first signed-in person who opens this link can join. The invitation expires automatically in seven days." />
    <Card style={styles.qr}><View style={styles.qrInner}><QRCode value={invite.url} size={190} color={colors.background} backgroundColor={colors.white} /></View><Text style={styles.expires}>EXPIRES {new Date(invite.expiresAt).toLocaleDateString()}</Text></Card>
    <Button label="Share private invite" icon="square.and.arrow.up" onPress={() => Share.share({ title: 'Join my PackProof', message: `Review and confirm our private transaction record: ${invite.url}`, url: invite.url })} />
    <Button label="Copy link" icon="doc.on.doc.fill" variant="secondary" onPress={async () => { await Clipboard.setStringAsync(invite.url); Alert.alert('Copied', 'The private invitation link is ready to paste.'); }} />
    <Text style={styles.warning}>Send this only to the intended buyer. PackProof will never ask either party to send payment through an invitation link.</Text>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, container: { flex: 1, padding: 20, gap: 12 }, close: { alignSelf: 'flex-start', minHeight: 40 }, qr: { alignItems: 'center', gap: 14, marginBottom: 4 }, qrInner: { backgroundColor: colors.white, padding: 16, borderRadius: 18 }, expires: { color: colors.muted, fontSize: 10, letterSpacing: 1.2, fontWeight: '900' }, warning: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 6 } });
