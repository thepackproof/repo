import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { LoadingScreen } from '@/components/ui';
import { subscribeEvidence, subscribeTransaction } from '@/lib/api';
import { packageSealProtocolStatus } from '@/lib/package-seal-protocol';
import { hrefForPrimaryAction, portalHandoffFromOpenParams, resolvePortalHandoff, toHref } from '@/lib/ux-flow';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceRecord, PackProofTransaction } from '@/types/models';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function PortalOpenHandoff() {
  const params = useLocalSearchParams<{
    transaction?: string | string[];
    action?: string | string[];
    issuedAt?: string | string[];
    expiresAt?: string | string[];
  }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [item, setItem] = useState<PackProofTransaction | null | undefined>(undefined);
  const [evidence, setEvidence] = useState<EvidenceRecord[] | undefined>(undefined);
  const opened = useRef(false);

  const handoff = useMemo(() => portalHandoffFromOpenParams({
    transaction: first(params.transaction),
    action: first(params.action),
    issuedAt: first(params.issuedAt),
    expiresAt: first(params.expiresAt),
  }), [params.action, params.expiresAt, params.issuedAt, params.transaction]);

  useEffect(() => {
    if (!handoff) return;
    const unsubTransaction = subscribeTransaction(handoff.transactionId, setItem, () => setItem(null));
    const unsubEvidence = subscribeEvidence(handoff.transactionId, setEvidence);
    return () => { unsubTransaction(); unsubEvidence(); };
  }, [handoff]);

  useEffect(() => {
    if (loading || !user || !handoff || item === undefined || evidence === undefined || opened.current) return;
    opened.current = true;
    if (!item) {
      router.replace('/(tabs)');
      return;
    }
    const resolved = resolvePortalHandoff({
      handoff,
      transaction: item,
      viewerId: user.uid,
      protocol: packageSealProtocolStatus(evidence),
    });
    router.replace(toHref(hrefForPrimaryAction(resolved.action ?? undefined, handoff.transactionId)));
  }, [evidence, handoff, item, loading, router, user]);

  if (loading) return <LoadingScreen />;
  if (!handoff) return <Redirect href="/(tabs)" />;
  if (!user) {
    return <Redirect href={{ pathname: '/welcome', params: { redirect: `/portal/open?transaction=${encodeURIComponent(handoff.transactionId)}` } }} />;
  }
  return <LoadingScreen />;
}
