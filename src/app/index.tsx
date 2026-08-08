import { Redirect } from 'expo-router';
import { LoadingScreen } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Redirect href={user ? '/(tabs)' : '/welcome'} />;
}
