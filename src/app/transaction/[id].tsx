import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Button, Card, Choice, Field, LoadingScreen } from '@/components/ui';
import { NextActionCard, WorkflowProgress } from '@/components/ux-orchestration';
import { colors } from '@/constants/brand';
import { callFunction, downloadUrl, subscribeEvents, subscribeEvidence, subscribeReturnPassports, subscribeTransaction } from '@/lib/api';
import { forceFreshCallableCredentials } from '@/lib/firebase';
import { enqueueEvidence, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { formatDate, formatMoney, readableError } from '@/lib/format';
import { formatActivityTime, humanActivitySentence } from '@/lib/ux-activity';
import { HUMAN_REVIEW_DISCLAIMER, packageSealProtocolStatus } from '@/lib/package-seal-protocol';
import { evidenceLabels } from '@/lib/transaction-detail-labels';
import { formatRuntimeEnum, normalizePhysicalStatus, type PhysicalStatusView } from '@/lib/runtime-display';
import {
  actionOutcomeCopy,
  captureTypeForAction,
  orderLabel,
  resolveNextRequiredAction,
  viewerRole,
  type NextRequiredAction,
  type UxPrimaryActionKind,
  type UxSecondaryActionKind,
} from '@/lib/ux-flow';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceRecord, EvidenceType, PackProofTransaction, ReturnPassport, TimelineEvent } from '@/types/models';

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<PackProofTransaction | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [returnPassports, setReturnPassports] = useState<ReturnPassport[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [carrier, setCarrier] = useState('USPS');
  const [tracking, setTracking] = useState('');
  const [showShipping, setShowShipping] = useState(false);
  const [showConcern, setShowConcern] = useState(false);
  const [concernReason, setConcernReason] = useState<'FRAUD' | 'HARASSMENT' | 'PROHIBITED_ITEM' | 'IMPERSONATION' | 'PRIVACY' | 'OTHER'>('OTHER');
  const [concernDetails, setConcernDetails] = useState('');
  const [showReturnRequest, setShowReturnRequest] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [showReturnShipping, setShowReturnShipping] = useState(false);
  const [returnCarrier, setReturnCarrier] = useState('USPS');
  const [returnTracking, setReturnTracking] = useState('');
  const [physicalStatus, setPhysicalStatus] = useState<PhysicalStatusView | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [outcome, setOutcome] = useState<{ succeeded: string; nextStep: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsubTransaction = subscribeTransaction(id, setItem, (error) => Alert.alert('Could not load PackProof', readableError(error)));
    const unsubEvidence = subscribeEvidence(id, setEvidence);
    const unsubEvents = subscribeEvents(id, setEvents);
    const unsubReturns = subscribeReturnPassports(id, setReturnPassports);
    return () => { unsubTransaction(); unsubEvidence(); unsubEvents(); unsubReturns(); };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    callFunction<{ transactionId: string }, unknown>('getPhysicalCorrespondenceStatus', { transactionId: id })
      .then((status) => { if (active) setPhysicalStatus(normalizePhysicalStatus(status)); })
      .catch(() => { if (active) setPhysicalStatus(null); });
    return () => { active = false; };
  }, [id, evidence.length]);

  useEffect(() => {
    if (!outcome) return;
    const timer = setTimeout(() => setOutcome(null), 4000);
    return () => clearTimeout(timer);
  }, [outcome]);

  const role = item && user ? viewerRole(item, user.uid) : 'SELLER';
  const protocol = useMemo(() => packageSealProtocolStatus(evidence), [evidence]);
  const activeReturn = returnPassports.find((passport) => !['COMPLETED', 'CANCELLED'].includes(passport.status)) ?? null;
  const returnProtocol = useMemo(
    () => (activeReturn ? packageSealProtocolStatus(evidence, { returnPassportId: activeReturn.id }) : null),
    [activeReturn, evidence],
  );
  const inviteSentAt = events.find((event) => event.type === 'INVITE_CREATED')?.createdAt ?? null;

  const ux = useMemo<NextRequiredAction | null>(() => {
    if (!item || !user) return null;
    return resolveNextRequiredAction({
      transaction: item,
      viewerId: user.uid,
      protocol,
      returnPassport: activeReturn,
      returnProtocol,
      inviteSentAt,
    });
  }, [item, user, protocol, activeReturn, returnProtocol, inviteSentAt]);

  const activityCtx = useMemo(() => (
    item && user
      ? { viewerId: user.uid, sellerId: item.sellerId, buyerId: item.buyerId }
      : null
  ), [item, user]);

  const run = async (name: string, action: () => Promise<void>, next?: NextRequiredAction) => {
    setBusy(name);
    try {
      await action();
      if (next) setOutcome(actionOutcomeCopy(name as UxPrimaryActionKind, next));
    } catch (error) {
      Alert.alert('Could not complete that', readableError(error));
    } finally {
      setBusy(null);
    }
  };

  const capture = (type: EvidenceType, returnPassportId?: string) => router.push({ pathname: '/capture/[id]', params: { id, type, ...(returnPassportId ? { returnPassportId } : {}) } });
  const createPacket = () => run('packet', async () => {
    await forceFreshCallableCredentials();
    const result = await callFunction<{ transactionId: string }, { storagePath: string }>('createEvidencePacket', { transactionId: id });
    await Linking.openURL(await downloadUrl(result.storagePath));
  });
  const attachPdf = () => run('document', async () => {
    if (!user) throw new Error('Sign in before attaching evidence.');
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets[0]) return;
    const file = result.assets[0];
    if (file.size && file.size > 600 * 1024 * 1024) throw new Error('Supporting PDFs must be smaller than 600 MB.');
    const queued = await enqueueEvidence({
      uploaderId: user.uid,
      transactionId: id,
      evidenceType: 'SUPPORTING_DOCUMENT',
      localUri: file.uri,
      contentType: 'application/pdf',
      originalName: file.name || `supporting-document-${Date.now()}.pdf`,
      manifest: null,
    });
    await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
    const sync = await syncEvidenceQueue({ targetId: queued.id });
    if (sync.uploadedIds.includes(queued.id)) {
      Alert.alert('Evidence ready', 'The document is now part of this PackProof. You can leave this screen.');
    } else if (sync.terminalIds.includes(queued.id)) {
      Alert.alert('Retry the upload', 'The file is still saved on this device. You do not need to recapture. Do not clear app data or uninstall.');
    } else {
      Alert.alert('Securing evidence record', 'You can leave this screen. PackProof will update when it finishes.');
    }
  });
  const cancelTransaction = () => Alert.alert(
    'Cancel this PackProof?',
    'This stops the transaction before the terms are locked.',
    [{ text: 'Keep it', style: 'cancel' }, { text: 'Cancel PackProof', style: 'destructive', onPress: () => run('cancel', () => callFunction('cancelTransaction', { transactionId: id }).then(() => undefined)) }],
  );

  const optimisticAfterConfirm = (): NextRequiredAction | undefined => {
    if (!item || !user) return undefined;
    const confirmedBy = Array.from(new Set([...(item.confirmedBy ?? []), user.uid]));
    const both = Boolean(item.buyerId && [item.sellerId, item.buyerId].every((uid) => confirmedBy.includes(uid)));
    return resolveNextRequiredAction({
      transaction: { ...item, confirmedBy, status: both ? 'TERMS_LOCKED' : 'TERMS_REVIEW' },
      viewerId: user.uid,
      protocol,
    });
  };

  const handlePrimary = (kind: UxPrimaryActionKind) => {
    if (!item || !user || !id) return;
    const captureType = captureTypeForAction(kind);
    switch (kind) {
      case 'EDIT_TERMS':
        router.push({ pathname: '/transaction/new', params: { transactionId: id } });
        return;
      case 'INVITE_BUYER':
        router.push(`/transaction/invite/${id}`);
        return;
      case 'CONFIRM_TERMS':
        void run('CONFIRM_TERMS', () => callFunction('confirmTerms', { transactionId: id }).then(() => undefined), optimisticAfterConfirm());
        return;
      case 'START_PACKING':
      case 'RECORD_SEAL':
      case 'RECORD_ARRIVAL':
      case 'RECORD_UNBOXING':
        if (captureType) capture(captureType);
        return;
      case 'RECORD_RETURN_PACKING':
      case 'RECORD_RETURN_SEAL':
      case 'RECORD_RETURN_UNBOXING':
        if (captureType) capture(captureType, activeReturn?.id);
        return;
      case 'ADD_SHIPMENT':
        setShowShipping(true);
        return;
      case 'ADD_RETURN_SHIPMENT':
        setShowReturnShipping(true);
        return;
      case 'CONFIRM_HANDOFF':
        void run('CONFIRM_HANDOFF', () => callFunction('confirmLocalHandoff', { transactionId: id }).then(() => undefined));
        return;
      case 'COMPLETE_TRANSACTION':
        void run('COMPLETE_TRANSACTION', () => callFunction('completeTransaction', { transactionId: id }).then(() => undefined));
        return;
      case 'OPEN_PASSPORT':
        router.push({ pathname: '/passport/[id]', params: { id } });
        return;
      case 'AUTHORIZE_RETURN':
        if (activeReturn) void run('AUTHORIZE_RETURN', () => callFunction('authorizeReturnPassport', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined));
        return;
      case 'COMPLETE_RETURN':
        if (activeReturn) void run('COMPLETE_RETURN', () => callFunction('completeReturnPassport', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined));
        return;
      default:
        return;
    }
  };

  const handleSecondary = (kind: UxSecondaryActionKind) => {
    if (!id) return;
    switch (kind) {
      case 'RESEND_INVITE':
        router.push(`/transaction/invite/${id}`);
        return;
      case 'EDIT_TERMS':
        router.push({ pathname: '/transaction/new', params: { transactionId: id } });
        return;
      case 'OPEN_PASSPORT':
        router.push({ pathname: '/passport/[id]', params: { id } });
        return;
      case 'MARK_RECEIVED':
        Alert.alert(
          'Skip arrival and unboxing?',
          'The packing record is stronger if you photograph the sealed package and record unboxing. PackProof will not infer a physical conclusion either way.',
          [{ text: 'Keep capturing', style: 'cancel' }, { text: 'Mark received', onPress: () => run('received', () => callFunction('markReceived', { transactionId: id }).then(() => undefined)) }],
        );
        return;
      case 'MARK_RETURN_RECEIVED':
        if (activeReturn) void run('returnReceived', () => callFunction('markReturnReceived', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined));
        return;
      default:
        return;
    }
  };

  if (!item || !user || !ux) return <LoadingScreen />;
  const order = orderLabel(item);
  const sourcePlatform = item.source && 'platform' in item.source ? item.source.platform : null;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Button label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
    <View style={styles.top}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.title}</Text>
        {order ? <Text style={styles.order}>{order}</Text> : null}
      </View>
      <Text style={styles.price}>{formatMoney(item.priceMinor, item.currency)}</Text>
    </View>

    <NextActionCard
      ux={ux}
      busy={busy === ux.primaryAction?.kind}
      outcome={outcome}
      onPrimary={ux.primaryAction ? () => handlePrimary(ux.primaryAction!.kind) : undefined}
      onSecondary={ux.secondaryAction ? () => handleSecondary(ux.secondaryAction!.kind) : undefined}
    />

    {ux.waitingReason === 'BUYER_JOIN' || ux.waitingReason === 'BUYER_CONFIRMATION' ? (
      <Text style={styles.waitingMeta}>
        {inviteSentAt ? `Invitation sent ${formatDate(inviteSentAt)}. ` : ''}
        {ux.lockedExplanation}
      </Text>
    ) : null}

    <Card style={styles.card}>
      <WorkflowProgress steps={ux.progressSteps} />
    </Card>

    <Card style={styles.card}>
      <Text style={styles.cardEyebrow}>TRANSACTION DETAILS</Text>
      <Text style={styles.detailLine}>
        {[formatMoney(item.priceMinor, item.currency), sourcePlatform, order].filter(Boolean).join(' · ') || item.category}
      </Text>
      <Text style={styles.body}>{item.description || 'No additional description supplied.'}</Text>
      <Text style={styles.small}>{item.terms.saleType === 'SHIPPED' ? 'Shipped' : 'Local handoff'} · Returns {formatRuntimeEnum(item.terms.returns).toLowerCase()}</Text>
    </Card>

    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Activity</Text></View>
    <Card style={styles.timeline}>
      {events.map((event, index) => (
        <View key={event.id} style={styles.event}>
          <View style={styles.eventRail}>
            <View style={styles.eventDot} />
            {index < events.length - 1 ? <View style={styles.eventLine} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: 17 }}>
            <Text style={styles.eventSummary}>{activityCtx ? humanActivitySentence(event, activityCtx) : event.summary}</Text>
            <Text style={styles.eventDate}>{formatActivityTime(event.createdAt)}</Text>
          </View>
        </View>
      ))}
      {!events.length ? <Text style={styles.small}>Activity appears here as each step completes.</Text> : null}
    </Card>

    {showShipping ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Shipment details</Text>
      <View style={styles.choices}>{['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((value) => <Choice key={value} label={value} selected={carrier === value} onPress={() => setCarrier(value)} />)}</View>
      <Field label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" placeholder="Enter the carrier tracking number" />
      <Button label="Record shipment" busy={busy === 'shipping'} disabled={tracking.trim().length < 3} onPress={() => run('shipping', async () => { await callFunction('submitShipping', { transactionId: id, carrier, trackingNumber: tracking.trim() }); setShowShipping(false); })} />
      {tracking.trim().length < 3 ? <Text style={styles.small}>Enter a tracking number to continue.</Text> : null}
      <Button label="Cancel" variant="ghost" onPress={() => setShowShipping(false)} />
    </Card> : null}

    {showReturnRequest ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Start a return</Text>
      <Text style={styles.small}>The other participant must authorize this before return packing begins.</Text>
      <Field label="Reason for return" value={returnReason} onChangeText={setReturnReason} multiline placeholder="Describe the return reason factually." />
      <Button label="Request return" busy={busy === 'requestReturn'} disabled={returnReason.trim().length < 5} onPress={() => run('requestReturn', async () => { await callFunction('initiateReturnPassport', { transactionId: id, reason: returnReason.trim() }); setShowReturnRequest(false); setReturnReason(''); })} />
      {returnReason.trim().length < 5 ? <Text style={styles.small}>Add a short reason so the other participant knows what to review.</Text> : null}
      <Button label="Cancel" variant="ghost" onPress={() => setShowReturnRequest(false)} />
    </Card> : null}

    {showReturnShipping && activeReturn ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Return shipment details</Text>
      <View style={styles.choices}>{['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((value) => <Choice key={value} label={value} selected={returnCarrier === value} onPress={() => setReturnCarrier(value)} />)}</View>
      <Field label="Return tracking number" value={returnTracking} onChangeText={setReturnTracking} autoCapitalize="characters" placeholder="Enter the return tracking number" />
      <Button label="Record return shipment" busy={busy === 'returnShipping'} disabled={returnTracking.trim().length < 3} onPress={() => run('returnShipping', async () => { await callFunction('submitReturnShipping', { transactionId: id, returnPassportId: activeReturn.id, carrier: returnCarrier, trackingNumber: returnTracking.trim() }); setShowReturnShipping(false); })} />
      <Button label="Cancel" variant="ghost" onPress={() => setShowReturnShipping(false)} />
    </Card> : null}

    {showConcern ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Raise a private concern</Text>
      <Text style={styles.small}>This pauses completion. It does not decide the dispute.</Text>
      <View style={styles.choices}>{(['FRAUD', 'HARASSMENT', 'PROHIBITED_ITEM', 'IMPERSONATION', 'PRIVACY', 'OTHER'] as const).map((value) => <Choice key={value} label={formatRuntimeEnum(value).toLowerCase()} selected={concernReason === value} onPress={() => setConcernReason(value)} />)}</View>
      <Field label="What happened?" value={concernDetails} onChangeText={setConcernDetails} multiline placeholder="Describe the issue factually." />
      <Button label="Submit concern" variant="danger" busy={busy === 'concern'} disabled={concernDetails.trim().length < 5} onPress={() => run('concern', async () => { await callFunction('raiseConcern', { transactionId: id, targetUserId: role === 'SELLER' ? item.buyerId : item.sellerId, reason: concernReason, details: concernDetails.trim() }); setShowConcern(false); })} />
      <Button label="Block the other participant" variant="ghost" busy={busy === 'block'} onPress={() => Alert.alert('Block this user?', 'They will be unable to join new PackProofs with you. Existing shared records remain available to both parties.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => run('block', () => callFunction('blockUser', { targetUserId: role === 'SELLER' ? item.buyerId : item.sellerId }).then(() => undefined)) }])} />
      <Button label="Cancel" variant="ghost" onPress={() => setShowConcern(false)} />
    </Card> : null}

    <Button label={showMore ? 'Hide more options' : 'More options'} variant="ghost" onPress={() => setShowMore(!showMore)} />

    {showMore ? <View style={styles.more}>
      {role === 'SELLER' && ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(item.status) && ux.primaryAction?.kind !== 'EDIT_TERMS' ? <Button label="Edit proposed terms" icon="pencil" variant="secondary" onPress={() => router.push({ pathname: '/transaction/new', params: { transactionId: id } })} /> : null}
      {role === 'SELLER' && ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(item.status) ? <Button label="Add item photo" icon="camera.fill" variant="secondary" onPress={() => capture('ITEM_PHOTO')} /> : null}
      {role === 'SELLER' && ['TERMS_LOCKED', 'PACKED'].includes(item.status) ? <Button label="Optional research series" icon="camera.metering.center.weighted" variant="secondary" onPress={() => router.push({ pathname: '/capture/physical/[id]', params: { id, intent: 'REFERENCE' } })} /> : null}
      {role === 'BUYER' && ['SHIPPED', 'BUYER_REVIEW', 'DISPUTED'].includes(item.status) ? <Button label="Optional research series" icon="viewfinder" variant="secondary" onPress={() => router.push({ pathname: '/capture/physical/[id]', params: { id, intent: 'VERIFICATION' } })} /> : null}
      {!['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <Button label="Attach supporting PDF" icon="doc.fill" variant="secondary" busy={busy === 'document'} onPress={attachPdf} /> : null}
      {ux.passportReady && ux.primaryAction?.kind !== 'OPEN_PASSPORT' ? <Button label="View Passport" icon="checkmark.shield.fill" variant="secondary" onPress={() => router.push({ pathname: '/passport/[id]', params: { id } })} /> : null}
      {!['DRAFT', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <Button label="Download evidence packet" icon="doc.text.fill" variant="secondary" busy={busy === 'packet'} onPress={createPacket} /> : null}
      {!activeReturn && item.buyerId && ['SHIPPED', 'BUYER_REVIEW', 'COMPLETED', 'DISPUTED'].includes(item.status) && (item.terms.returns !== 'NO_RETURNS' || item.status === 'DISPUTED') ? <Button label="Start a return" icon="arrow.uturn.backward.circle.fill" variant="secondary" onPress={() => setShowReturnRequest(true)} /> : null}
      {item.buyerId && !['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <Button label="Raise a concern" icon="exclamationmark.triangle.fill" variant="danger" onPress={() => setShowConcern(true)} /> : null}
      {role === 'SELLER' && ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(item.status) ? <Button label="Cancel PackProof" icon="xmark.circle.fill" variant="danger" busy={busy === 'cancel'} onPress={cancelTransaction} /> : null}

      {item.shipping ? <Card style={styles.card}><Text style={styles.cardEyebrow}>SHIPMENT</Text><Text style={styles.body}>{item.shipping.carrier} · {item.shipping.trackingNumber}</Text><Text style={styles.small}>Recorded {formatDate(item.shipping.shippedAt)}</Text></Card> : null}

      {item.terms.saleType === 'SHIPPED' && !['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW', 'CANCELLED'].includes(item.status) ? <Card style={styles.card}>
        <Text style={styles.cardEyebrow}>PACKING AND ARRIVAL</Text>
        <Text style={styles.body}>{HUMAN_REVIEW_DISCLAIMER}</Text>
        <Text style={styles.small}>{protocol.hasPackingVideo ? '✓' : '○'} Packing video</Text>
        <Text style={styles.small}>{protocol.hasSealReference ? '✓' : '○'} Seal and label</Text>
        <Text style={styles.small}>{protocol.hasArrivalPhoto ? '✓' : '○'} Arrival photo</Text>
        <Text style={styles.small}>{protocol.hasUnboxingVideo ? '✓' : '○'} Unboxing</Text>
      </Card> : null}

      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Evidence</Text><Text style={styles.count}>{evidence.length}</Text></View>
      {evidence.map((record) => (
        <Card key={record.id} style={styles.evidence}>
          <View style={styles.evidenceIcon}><AppIcon name={record.contentType.startsWith('video') ? 'video.fill' : record.contentType === 'application/pdf' ? 'doc.fill' : 'photo.fill'} size={21} tintColor={colors.teal} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.evidenceTitle}>{evidenceLabels[record.type]}</Text>
            <Text style={styles.evidenceMeta}>{formatDate(record.createdAt)}</Text>
          </View>
          <Text onPress={() => downloadUrl(record.storagePath).then(Linking.openURL).catch((error) => Alert.alert('Could not open evidence', readableError(error)))} style={styles.open}>OPEN</Text>
        </Card>
      ))}
      {!evidence.length ? <Text style={styles.small}>Evidence appears here after PackProof finishes securing it.</Text> : null}

      <Button label={showTechnical ? 'Hide technical details' : 'Show technical details'} variant="ghost" onPress={() => setShowTechnical(!showTechnical)} />
      {showTechnical ? <>
        {physicalStatus ? <Card style={styles.card}>
          <Text style={styles.cardEyebrow}>OPTIONAL RESEARCH SERIES</Text>
          <Text style={styles.body}>{physicalStatus.reason === 'NO_REFERENCE_CAPTURE' ? 'No optional research series has been recorded.' : 'Research observations are stored separately from the packing workflow.'}</Text>
        </Card> : null}
        {evidence.map((record) => (
          <Text key={`${record.id}-hash`} style={styles.hash}>{evidenceLabels[record.type]} · {record.sha256.slice(0, 16)}…</Text>
        ))}
      </> : null}
    </View> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48, gap: 15 },
  back: { alignSelf: 'flex-start', minHeight: 40 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  order: { color: colors.muted, fontSize: 13, marginTop: 4, fontWeight: '700' },
  price: { color: colors.teal, fontSize: 18, fontWeight: '900' },
  waitingMeta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: -6 },
  card: { gap: 10 },
  cardEyebrow: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  detailLine: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  small: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  form: { gap: 14 },
  choices: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  count: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  timeline: { gap: 0 },
  event: { flexDirection: 'row', gap: 10 },
  eventRail: { width: 16, alignItems: 'center' },
  eventDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.teal, marginTop: 3 },
  eventLine: { width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 },
  eventSummary: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  eventDate: { color: colors.muted, fontSize: 11, marginTop: 4 },
  more: { gap: 9 },
  evidence: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
  evidenceIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(70,124,99,0.08)', alignItems: 'center', justifyContent: 'center' },
  evidenceTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  evidenceMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  open: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  hash: { color: colors.muted, fontSize: 10 },
});
