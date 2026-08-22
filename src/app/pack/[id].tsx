import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Choice, Field, LoadingScreen } from '@/components/ui';
import { TaskArt } from '@/components/task-art';
import { TaskSession } from '@/components/task-session';
import { callFunction, subscribeEvidence, subscribeReturnPassports, subscribeTransaction } from '@/lib/api';
import { readableError } from '@/lib/format';
import { packageSealProtocolStatus } from '@/lib/package-seal-protocol';
import { useWorkspaceSlice } from '@/hooks/use-workspace-slices';
import { displayCarrierName, toHref } from '@/lib/ux-flow';
import { workspaceFromSlice } from '@/lib/workspace';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceRecord, EvidenceType, PackProofTransaction, ReturnPassport } from '@/types/models';

type Beat = 'prep' | 'label' | 'tracking' | 'done';

function asBeat(value?: string): Beat | null {
  if (value === 'prep' || value === 'label' || value === 'tracking' || value === 'done') return value;
  return null;
}

export default function PackSession() {
  const { id, beat: beatParam, tracking: trackingParam, carrier: carrierParam } = useLocalSearchParams<{
    id: string;
    beat?: string;
    tracking?: string;
    carrier?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<PackProofTransaction | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [returnPassports, setReturnPassports] = useState<ReturnPassport[]>([]);
  const [busy, setBusy] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const trackingFromRoute = typeof trackingParam === 'string' ? trackingParam : '';
  const carrierFromRoute = typeof carrierParam === 'string' ? carrierParam : '';
  const [trackingEdit, setTracking] = useState(trackingFromRoute);
  const [carrierEdit, setCarrier] = useState(() => displayCarrierName(carrierFromRoute) || 'USPS');
  const [showCarrierEdit, setShowCarrier] = useState(!carrierFromRoute);
  const tracking = trackingFromRoute || trackingEdit;
  const carrier = carrierFromRoute ? (displayCarrierName(carrierFromRoute) || carrierFromRoute.toUpperCase()) : carrierEdit;
  const showCarrier = carrierFromRoute ? false : showCarrierEdit;

  useEffect(() => {
    if (!id) return;
    const unsubTransaction = subscribeTransaction(id, setItem, (error) => Alert.alert('Could not load PackProof', readableError(error)));
    const unsubEvidence = subscribeEvidence(id, setEvidence);
    const unsubReturns = subscribeReturnPassports(id, setReturnPassports);
    return () => { unsubTransaction(); unsubEvidence(); unsubReturns(); };
  }, [id]);

  const protocol = useMemo(() => packageSealProtocolStatus(evidence), [evidence]);
  const activeReturn = returnPassports.find((passport) => !['COMPLETED', 'CANCELLED'].includes(passport.status)) ?? null;
  const returnProtocol = useMemo(
    () => (activeReturn ? packageSealProtocolStatus(evidence, { returnPassportId: activeReturn.id }) : null),
    [activeReturn, evidence],
  );
  const slice = useWorkspaceSlice(id, item ? String(item.updatedAt) : undefined);
  const ux = useMemo(() => {
    if (!item || !user || !slice) return null;
    return workspaceFromSlice(item, user.uid, slice, {
      returnPassport: activeReturn,
      returnProtocol,
    }).nextAction;
  }, [item, user, slice, activeReturn, returnProtocol]);

  const returning = Boolean(activeReturn && (ux?.primaryAction?.kind === 'RECORD_RETURN_PACKING' || ux?.primaryAction?.kind === 'RECORD_RETURN_SEAL' || ux?.primaryAction?.kind === 'ADD_RETURN_SHIPMENT'));
  const liveProtocol = returning ? (returnProtocol ?? protocol) : protocol;
  const beat: Beat = asBeat(typeof beatParam === 'string' ? beatParam : undefined)
    ?? (item?.shipping ? 'done'
      : liveProtocol.sellerReferenceComplete ? 'tracking'
        : liveProtocol.hasPackingVideo ? 'label'
          : 'prep');

  const openCapture = async (type: EvidenceType) => {
    const cameraResult = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const needsMic = type === 'PACKING_VIDEO' || type === 'RETURN_PACKING_VIDEO' || type === 'UNBOXING_VIDEO' || type === 'RETURN_UNBOXING_VIDEO';
    const micResult = !needsMic || microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
    if (!cameraResult?.granted || (needsMic && !micResult?.granted)) {
      const blocked = cameraResult?.canAskAgain === false || (needsMic && micResult?.canAskAgain === false);
      Alert.alert(
        'Camera access is needed',
        needsMic
          ? 'PackProof needs camera and microphone access to record packing. Enable Camera for PackProof in Settings.'
          : 'PackProof needs camera access to photograph the package. Enable Camera for PackProof in Settings.',
        blocked
          ? [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }]
          : [{ text: 'Continue' }],
      );
      return;
    }
    router.replace({
      pathname: '/capture/[id]',
      params: {
        id,
        type,
        session: 'pack',
        ...(returning && activeReturn ? { returnPassportId: activeReturn.id } : {}),
      },
    });
  };

  const goHome = () => router.replace('/(tabs)');

  if (!id || !item || !user) return <LoadingScreen />;
  const identity = item.title;

  if (beat === 'done' || item.status === 'SHIPPED') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="check" />}
        title="You’re done"
        sentence="We’ll take it from here. We’ll notify you when anything else needs your attention."
        onClose={goHome}
        closeLabel="Done"
        primary={{ label: 'Done', onPress: goHome }}
      />
    );
  }

  if (beat === 'tracking') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="label" />}
        title="Tracking looks right?"
        sentence={tracking.trim() ? `${displayCarrierName(carrier) || carrier} ${tracking.trim()}` : 'Type the number from the label if we didn’t catch it.'}
        onClose={goHome}
        align="start"
        primary={{
          label: 'Looks right',
          busy,
          disabled: tracking.trim().length < 3,
          onPress: () => {
            setBusy(true);
            const submit = returning && activeReturn
              ? callFunction('submitReturnShipping', { transactionId: id, returnPassportId: activeReturn.id, carrier, trackingNumber: tracking.trim() })
              : callFunction('submitShipping', { transactionId: id, carrier, trackingNumber: tracking.trim() });
            void submit.then(() => {
              router.replace(toHref({ pathname: '/pack/[id]', params: { id, beat: 'done' } }));
            }).catch((error) => {
              Alert.alert('Could not save tracking', readableError(error));
            }).finally(() => setBusy(false));
          },
        }}
        secondary={showCarrier ? undefined : { label: 'Different carrier', onPress: () => setShowCarrier(true) }}
      >
        {tracking.trim() ? null : (
          <Field label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" placeholder="Tracking number" />
        )}
        {showCarrier || !tracking.trim() ? (
          <View style={styles.choices}>
            {['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((value) => (
              <Choice key={value} label={value} selected={carrier === value} onPress={() => setCarrier(value)} />
            ))}
          </View>
        ) : null}
      </TaskSession>
    );
  }

  if (beat === 'label') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="label" />}
        title="Packing saved"
        sentence="Photograph the box with the label on it."
        onClose={goHome}
        primary={{
          label: 'Photograph the box',
          onPress: () => { void openCapture(returning ? 'RETURN_SHIPPING_LABEL' : 'SHIPPING_LABEL'); },
        }}
      />
    );
  }

  return (
    <TaskSession
      identity={identity}
      art={<TaskArt kind="phone" />}
      title="Set your phone down"
      sentence="Keep the item and box in view."
      onClose={goHome}
      primary={{
        label: 'I’m ready',
        onPress: () => { void openCapture(returning ? 'RETURN_PACKING_VIDEO' : 'PACKING_VIDEO'); },
      }}
    />
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
