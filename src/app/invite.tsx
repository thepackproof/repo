import { useState } from 'react';
import { Alert } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingScreen } from '@/components/ui';
import { TaskArt } from '@/components/task-art';
import { TaskSession } from '@/components/task-session';
import { callFunction } from '@/lib/api';
import { toHref } from '@/lib/ux-flow';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

export default function AcceptInvite() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (loading) return <LoadingScreen />;
  if (!user) return <Redirect href={{ pathname: '/welcome', params: code ? { invite: code } : {} }} />;
  const accept = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const result = await callFunction<{ code: string }, { transactionId: string }>('acceptInvite', { code });
      router.replace(toHref({ pathname: '/task/[id]', params: { id: result.transactionId } }));
    } catch (error) {
      Alert.alert('Invitation unavailable', readableError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <TaskSession
      art={<TaskArt kind="share" />}
      title="You’ve been invited"
      sentence="Continue to see the item and price."
      onClose={() => router.replace('/(tabs)')}
      primary={{ label: 'Continue', busy, disabled: !code, onPress: () => { void accept(); } }}
      secondary={{ label: 'Not now', onPress: () => router.replace('/(tabs)') }}
    />
  );
}
