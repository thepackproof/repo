import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Choice, Field, LoadingScreen } from '@/components/ui';
import { DealFacts } from '@/components/deal-facts';
import { InviteShare } from '@/components/invite-share';
import { TaskArt } from '@/components/task-art';
import { TaskSession } from '@/components/task-session';
import { callFunction, subscribeEvents, subscribeEvidence, subscribeReturnPassports, subscribeTransaction } from '@/lib/api';
import { readableError } from '@/lib/format';
import { packageSealProtocolStatus } from '@/lib/package-seal-protocol';
import { displayCarrierName, hrefForPrimaryAction, PACK_SESSION_ACTIONS, resolveNextRequiredAction, toHref, toUxFlowInput, type NextRequiredAction } from '@/lib/ux-flow';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceRecord, PackProofTransaction, ReturnPassport, TimelineEvent } from '@/types/models';

export default function TaskScreen() {
  const { id, fromShare } = useLocalSearchParams<{ id: string; fromShare?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<PackProofTransaction | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [returnPassports, setReturnPassports] = useState<ReturnPassport[]>([]);
  const [busy, setBusy] = useState(false);
  const [carrier, setCarrier] = useState('USPS');
  const [tracking, setTracking] = useState('');
  const [showCarrier, setShowCarrier] = useState(false);

  useEffect(() => {
    if (!id) return;
    const unsubTransaction = subscribeTransaction(id, setItem, (error) => Alert.alert('Could not load PackProof', readableError(error)));
    const unsubEvidence = subscribeEvidence(id, setEvidence);
    const unsubEvents = subscribeEvents(id, setEvents);
    const unsubReturns = subscribeReturnPassports(id, setReturnPassports);
    return () => { unsubTransaction(); unsubEvidence(); unsubEvents(); unsubReturns(); };
  }, [id]);

  const protocol = useMemo(() => packageSealProtocolStatus(evidence), [evidence]);
  const activeReturn = returnPassports.find((passport) => !['COMPLETED', 'CANCELLED'].includes(passport.status)) ?? null;
  const returnProtocol = useMemo(
    () => (activeReturn ? packageSealProtocolStatus(evidence, { returnPassportId: activeReturn.id }) : null),
    [activeReturn, evidence],
  );
  const inviteSentAt = events.find((event) => event.type === 'INVITE_CREATED')?.createdAt ?? null;

  const ux = useMemo<NextRequiredAction | null>(() => {
    if (!item || !user) return null;
    return resolveNextRequiredAction(toUxFlowInput(item, user.uid, {
      protocol,
      returnPassport: activeReturn,
      returnProtocol,
      inviteSentAt,
    }));
  }, [item, user, protocol, activeReturn, returnProtocol, inviteSentAt]);

  const goHome = () => router.replace('/(tabs)');
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); } catch (error) { Alert.alert('Could not complete that', readableError(error)); } finally { setBusy(false); }
  };

  if (!id || !item || !user || !ux) return <LoadingScreen />;

  const kind = ux.primaryAction?.kind;
  if (kind && PACK_SESSION_ACTIONS.has(kind)) {
    return <Redirect href={toHref(hrefForPrimaryAction(kind, id))} />;
  }

  const identity = item.title;
  const close = { onClose: goHome, closeLabel: 'Done' };

  if (kind === 'INVITE_BUYER' && fromShare !== '1') {
    return (
      <InviteShare
        transactionId={id}
        identity={identity}
        onShared={() => router.replace(toHref({ pathname: '/task/[id]', params: { id, fromShare: '1' } }))}
        onClose={goHome}
      />
    );
  }

  if (kind === 'CONFIRM_TERMS') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="box" />}
        title="Confirm this sale"
        sentence="Only tap Confirm if this is exactly right."
        onClose={goHome}
        primary={{
          label: 'Confirm',
          busy,
          onPress: () => { void run(() => callFunction('confirmTerms', { transactionId: id }).then(() => undefined)); },
        }}
      >
        <DealFacts transaction={item} />
      </TaskSession>
    );
  }

  if (kind === 'CONFIRM_HANDOFF') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="box" />}
        title="Item in hand?"
        sentence="Confirm when it actually changes hands."
        onClose={goHome}
        primary={{
          label: 'Confirm',
          busy,
          onPress: () => { void run(() => callFunction('confirmLocalHandoff', { transactionId: id }).then(() => undefined)); },
        }}
      />
    );
  }

  if (kind === 'ADD_SHIPMENT' || kind === 'ADD_RETURN_SHIPMENT') {
    const returnJob = kind === 'ADD_RETURN_SHIPMENT';
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="label" />}
        title="Tracking looks right?"
        sentence={tracking.trim() ? `${displayCarrierName(carrier) || carrier} ${tracking.trim()}` : 'Add the tracking number from the label.'}
        onClose={goHome}
        align="start"
        primary={{
          label: 'Looks right',
          busy,
          disabled: tracking.trim().length < 3,
          onPress: () => {
            void run(async () => {
              if (returnJob && activeReturn) {
                await callFunction('submitReturnShipping', { transactionId: id, returnPassportId: activeReturn.id, carrier, trackingNumber: tracking.trim() });
              } else {
                await callFunction('submitShipping', { transactionId: id, carrier, trackingNumber: tracking.trim() });
              }
            });
          },
        }}
        secondary={showCarrier ? undefined : { label: 'Different carrier', onPress: () => setShowCarrier(true) }}
      >
        <Field label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" placeholder="Tracking number" />
        {showCarrier || !tracking ? (
          <View style={styles.choices}>
            {['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((value) => (
              <Choice key={value} label={value} selected={carrier === value} onPress={() => setCarrier(value)} />
            ))}
          </View>
        ) : null}
      </TaskSession>
    );
  }

  if (kind === 'RECORD_ARRIVAL') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="box" />}
        title="Photograph the arrived box"
        sentence="Do this before you open it."
        onClose={goHome}
        primary={{
          label: 'Take photo',
          onPress: () => router.replace(toHref(hrefForPrimaryAction(kind, id))),
        }}
        secondary={ux.secondaryAction?.kind === 'MARK_RECEIVED'
          ? {
            label: 'Skip photos',
            onPress: () => {
              Alert.alert(
                'Skip photos?',
                'The record is stronger if you photograph the sealed package first.',
                [
                  { text: 'Keep going', style: 'cancel' },
                  { text: 'Skip', onPress: () => { void run(() => callFunction('markReceived', { transactionId: id }).then(() => undefined)); } },
                ],
              );
            },
          }
          : undefined}
      />
    );
  }

  if (kind === 'RECORD_UNBOXING' || kind === 'RECORD_RETURN_UNBOXING') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="box" />}
        title="Record the unboxing"
        sentence="Start with the sealed package and keep it on camera."
        onClose={goHome}
        primary={{
          label: 'I’m ready',
          onPress: () => router.replace(toHref(hrefForPrimaryAction(kind, id))),
        }}
        secondary={ux.secondaryAction?.kind === 'MARK_RECEIVED' || ux.secondaryAction?.kind === 'MARK_RETURN_RECEIVED'
          ? {
            label: 'Skip video',
            onPress: () => {
              void run(async () => {
                if (kind === 'RECORD_RETURN_UNBOXING' && activeReturn) {
                  await callFunction('markReturnReceived', { transactionId: id, returnPassportId: activeReturn.id });
                } else {
                  await callFunction('markReceived', { transactionId: id });
                }
              });
            },
          }
          : undefined}
      />
    );
  }

  if (kind === 'COMPLETE_TRANSACTION') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="check" />}
        title="Finish"
        sentence="Confirm that everything looks complete."
        onClose={goHome}
        primary={{
          label: 'Finish',
          busy,
          onPress: () => { void run(() => callFunction('completeTransaction', { transactionId: id }).then(() => undefined)); },
        }}
      />
    );
  }

  if (kind === 'AUTHORIZE_RETURN' && activeReturn) {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="box" />}
        title="Approve this return"
        sentence="Authorize it before any repacking begins."
        onClose={goHome}
        primary={{
          label: 'Authorize return',
          busy,
          onPress: () => { void run(() => callFunction('authorizeReturnPassport', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined)); },
        }}
      />
    );
  }

  if (kind === 'COMPLETE_RETURN' && activeReturn) {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="check" />}
        title="Finish the return"
        sentence="Confirm that the return looks complete."
        onClose={goHome}
        primary={{
          label: 'Finish',
          busy,
          onPress: () => { void run(() => callFunction('completeReturnPassport', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined)); },
        }}
      />
    );
  }

  if (kind === 'OPEN_PASSPORT' || ux.consumerState === 'complete') {
    return (
      <TaskSession
        identity={identity}
        art={<TaskArt kind="check" />}
        title="PackProof complete"
        sentence="We’ll keep the record for you."
        {...close}
        primary={{ label: 'Done', onPress: goHome }}
        secondary={ux.passportReady ? { label: 'View record', onPress: () => router.push({ pathname: '/transaction/[id]', params: { id } }) } : undefined}
      />
    );
  }

  return (
    <TaskSession
      identity={identity}
      art={<TaskArt kind="check" />}
      title={fromShare === '1' || ux.noActionRequired ? 'You’re done' : ux.headline}
      sentence={ux.noActionRequired || fromShare === '1'
        ? 'We’ll notify you when anything else needs your attention.'
        : ux.instruction}
      {...close}
      primary={ux.noActionRequired || fromShare === '1' ? { label: 'Done', onPress: goHome } : undefined}
      secondary={ux.secondaryAction?.kind === 'RESEND_INVITE'
        ? { label: 'Share again', onPress: () => router.push(`/transaction/invite/${id}`) }
        : { label: 'View record', onPress: () => router.push({ pathname: '/transaction/[id]', params: { id } }) }}
    />
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
