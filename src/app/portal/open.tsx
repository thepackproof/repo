import { useEffect } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingScreen } from '@/components/ui';
import { hrefForPrimaryAction, toHref, type UxPrimaryActionKind } from '@/lib/ux-flow';
import { useAuth } from '@/providers/auth-provider';

const ACTION_KIND: Record<string, UxPrimaryActionKind> = {
  pack: 'START_PACKING',
  seal: 'RECORD_SEAL',
  arrival: 'RECORD_ARRIVAL',
  unbox: 'RECORD_UNBOXING',
  'return-unbox': 'RECORD_RETURN_UNBOXING',
};

export default function PortalOpenHandoff() {
  const { transaction, action } = useLocalSearchParams<{ transaction?: string; action?: string }>();
  const { sessionReady, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !sessionReady || !transaction) return;
    const kind = ACTION_KIND[action ?? 'pack'] ?? 'START_PACKING';
    router.replace(toHref(hrefForPrimaryAction(kind, transaction)));
  }, [action, loading, router, sessionReady, transaction]);

  if (loading) return <LoadingScreen />;
  if (!transaction) return <Redirect href="/(tabs)" />;
  if (!sessionReady) {
    return <Redirect href={{ pathname: '/welcome', params: { redirect: `/portal/open?transaction=${encodeURIComponent(transaction)}&action=${encodeURIComponent(action ?? 'pack')}` } }} />;
  }
  return <LoadingScreen />;
}
