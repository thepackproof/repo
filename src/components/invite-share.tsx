import { useEffect, useRef, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { Button, LoadingScreen } from '@/components/ui';
import { TaskArt } from '@/components/task-art';
import { TaskSession } from '@/components/task-session';
import { colors } from '@/constants/brand';
import { callFunction } from '@/lib/api';
import { readableError } from '@/lib/format';

export function InviteShare({
  transactionId,
  identity,
  onShared,
  onClose,
}: {
  transactionId: string;
  identity?: string;
  onShared: () => void;
  onClose: () => void;
}) {
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [more, setMore] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let active = true;
    callFunction<{ transactionId: string }, { url: string; expiresAt: string }>('createInvite', { transactionId })
      .then((value) => { if (active) setInvite(value); })
      .catch((error) => {
        if (!active) return;
        Alert.alert('Could not create invitation', readableError(error));
        onCloseRef.current();
      });
    return () => { active = false; };
  }, [transactionId]);

  if (!invite) return <LoadingScreen />;

  const share = async () => {
    await Share.share({
      title: 'Join my PackProof',
      message: `Take a look and confirm if this looks right: ${invite.url}`,
      url: invite.url,
    });
    onShared();
  };

  return (
    <TaskSession
      identity={identity}
      art={<TaskArt kind="share" />}
      title="Share this"
      sentence="Send it the same way you already talk."
      onClose={onClose}
      primary={{ label: 'Share', icon: 'square.and.arrow.up', onPress: () => { void share(); } }}
      secondary={{ label: more ? 'Hide extra options' : 'More', onPress: () => setMore((value) => !value) }}
    >
      {more ? (
        <View style={styles.more}>
          <View style={styles.qrInner}>
            <QRCode value={invite.url} size={160} color={colors.ink} backgroundColor={colors.white} />
          </View>
          <Text style={styles.meta}>Expires {new Date(invite.expiresAt).toLocaleDateString()}</Text>
          <Button
            label="Copy link"
            variant="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(invite.url);
              Alert.alert('Copied', 'The private invitation is ready to paste.');
            }}
          />
          <Text style={styles.note}>PackProof will never ask anyone to send payment through this link.</Text>
        </View>
      ) : null}
    </TaskSession>
  );
}

const styles = StyleSheet.create({
  more: { gap: 12, alignItems: 'center', marginTop: 8 },
  qrInner: { backgroundColor: colors.white, padding: 14, borderRadius: 18 },
  meta: { color: colors.muted, fontSize: 13 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
