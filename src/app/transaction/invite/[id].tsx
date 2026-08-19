import { useLocalSearchParams, useRouter } from 'expo-router';
import { InviteShare } from '@/components/invite-share';
import { toHref } from '@/lib/ux-flow';

export default function InviteBuyer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  if (!id) return null;
  return (
    <InviteShare
      transactionId={id}
      onShared={() => router.replace(toHref({ pathname: '/task/[id]', params: { id, fromShare: '1' } }))}
      onClose={() => router.replace(toHref({ pathname: '/task/[id]', params: { id } }))}
    />
  );
}
