import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Button, Card, Choice, Field, LoadingScreen, ProgressBar, StatusPill } from '@/components/ui';
import { colors } from '@/constants/brand';
import { callFunction, downloadUrl, subscribeEvents, subscribeEvidence, subscribeReturnPassports, subscribeTransaction } from '@/lib/api';
import { forceFreshCallableCredentials } from '@/lib/firebase';
import { enqueueEvidence, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { formatDate, formatMoney, readableError, statusProgress } from '@/lib/format';
import { HUMAN_REVIEW_DISCLAIMER, groupHumanReviewObservations, packageSealProtocolStatus } from '@/lib/package-seal-protocol';
import { formatRuntimeEnum, normalizePhysicalStatus, type PhysicalStatusView } from '@/lib/runtime-display';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceRecord, EvidenceType, PackProofTransaction, ReturnPassport, TimelineEvent } from '@/types/models';

const evidenceLabels: Record<EvidenceType, string> = {
  ITEM_PHOTO: 'Item photo', CONDITION_PHOTO: 'Condition photo', IDENTIFIER_PHOTO: 'Identifier photo', COA_PHOTO: 'COA photo', PACKING_VIDEO: 'Continuous packing video', SHIPPING_LABEL: 'High-resolution seal reference', UNBOXING_VIDEO: 'Continuous unboxing video', DELIVERY_PHOTO: 'Arrival package observation', SUPPORTING_DOCUMENT: 'Supporting document', RETURN_CONDITION_PHOTO: 'Return condition photo', RETURN_PACKING_VIDEO: 'Continuous return repacking video', RETURN_SHIPPING_LABEL: 'High-resolution return seal reference', RETURN_UNBOXING_VIDEO: 'Continuous returned-item unboxing video', PHYSICAL_REFERENCE_FRAME: 'Physical reference frame', PHYSICAL_VERIFICATION_FRAME: 'Physical verification frame',
};

function shortId(id?: string | null) { return id ? `${id.slice(0, 5)}…${id.slice(-4)}` : 'Not joined'; }

function attestationLabel(record: EvidenceRecord): string {
  switch (record.attestationStatus) {
    case 'ONLINE_APP_CHECK_AND_KEY_POSSESSION':
    case 'JIT_VERIFIED': return 'ONLINE APP CHECK + KEY POSSESSION';
    case 'ONLINE_APP_CHECK_ONLY':
    case 'JIT_APP_CHECK_ONLY': return 'ONLINE APP CHECK ONLY';
    case 'OFFLINE_UNATTESTED': return 'OFFLINE / UNATTESTED';
    default: return 'NO APP/DEVICE CONTEXT';
  }
}

function byteIntegrityLabel(record: EvidenceRecord): string {
  return record.assurance?.byteIntegrity.status
    ?? (record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
      ? 'MISMATCH'
      : record.clientHashMatched === true ? 'MATCHED' : 'SERVER HASH ONLY');
}

function trackingStatus(record: EvidenceRecord): EvidenceRecord['carrierTrackingMatchStatus'] | EvidenceRecord['postSubmissionTrackingMatchStatus'] {
  return record.postSubmissionTrackingMatchStatus ?? record.carrierTrackingMatchStatus;
}

function trackingLabel(record: EvidenceRecord): string | null {
  const status = trackingStatus(record);
  if (!status || status === 'NOT_SCANNED') return null;
  return `${record.postSubmissionTrackingMatchStatus ? 'SUBMITTED TRACKING' : 'TRACKING'} ${formatRuntimeEnum(status)}`;
}

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

  const role = item?.sellerId === user?.uid ? 'SELLER' : 'BUYER';
  const confirmed = Boolean(user?.uid && item?.confirmedBy?.includes(user.uid));
  const handoffConfirmed = Boolean(user?.uid && item?.handoffConfirmedBy?.includes(user.uid));
  const completed = Boolean(user?.uid && item?.completedBy?.includes(user.uid));
  const hashes = useMemo(() => new Set(evidence.map((record) => record.sha256)), [evidence]);
  const protocol = useMemo(() => packageSealProtocolStatus(evidence), [evidence]);
  const reviewGroups = useMemo(() => groupHumanReviewObservations(evidence), [evidence]);
  const activeReturn = returnPassports.find((passport) => !['COMPLETED', 'CANCELLED'].includes(passport.status)) ?? null;
  const returnProtocol = useMemo(
    () => (activeReturn ? packageSealProtocolStatus(evidence, { returnPassportId: activeReturn.id }) : null),
    [activeReturn, evidence],
  );
  const returnRequester = activeReturn?.initiatedBy === user?.uid;
  const returningParticipant = (activeReturn?.returningParticipantId ?? item?.buyerId) === user?.uid;
  const returnRecipient = activeReturn?.recipientId === user?.uid;

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try { await action(); } catch (error) { Alert.alert('Could not complete that', readableError(error)); } finally { setBusy(null); }
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
      Alert.alert('Document finalized', 'The server completed independent hashing, PDF media-type inspection, and service-authenticated manifest creation.');
    } else if (sync.terminalIds.includes(queued.id)) {
      Alert.alert('Document retained — attention required', 'The encrypted PDF remains on this device, but automatic retry stopped for a non-retryable condition. Do not clear app data or uninstall.');
    } else {
      Alert.alert('Document secured in queue', 'The PDF is encrypted in PackProof’s private queue and will retry when server access and connectivity are available.');
    }
  });
  const cancelTransaction = () => Alert.alert(
    'Cancel this PackProof?',
    'This stops the transaction before the terms are locked. The cancellation remains in the shared audit timeline.',
    [{ text: 'Keep it', style: 'cancel' }, { text: 'Cancel PackProof', style: 'destructive', onPress: () => run('cancel', () => callFunction('cancelTransaction', { transactionId: id }).then(() => undefined)) }],
  );

  if (!item || !user) return <LoadingScreen />;
  const actions = <View style={styles.actions}>
    {role === 'SELLER' && ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(item.status) ? <Button label="Edit proposed terms" icon="pencil" variant="secondary" onPress={() => router.push({ pathname: '/transaction/new', params: { transactionId: id } })} /> : null}
    {role === 'SELLER' && ['DRAFT', 'AWAITING_BUYER'].includes(item.status) && !item.buyerId ? <Button label={item.status === 'DRAFT' ? 'Invite buyer' : 'Create a new invite'} icon="person.badge.plus" onPress={() => router.push(`/transaction/invite/${id}`)} /> : null}
    {['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(item.status) && role === 'SELLER' ? <Button label="Add item or condition photo" icon="camera.fill" variant="secondary" onPress={() => capture('ITEM_PHOTO')} /> : null}
    {item.status === 'TERMS_REVIEW' ? <Button label={confirmed ? 'Terms confirmed—waiting' : 'Confirm these exact terms'} icon="checkmark.shield.fill" disabled={confirmed} busy={busy === 'confirm'} onPress={() => run('confirm', () => callFunction('confirmTerms', { transactionId: id }).then(() => undefined))} /> : null}
    {item.status === 'TERMS_LOCKED' && item.terms.saleType === 'SHIPPED' && role === 'SELLER' ? <Button label="Record continuous packing" icon="video.fill" onPress={() => capture('PACKING_VIDEO')} /> : null}
    {role === 'SELLER' && ['TERMS_LOCKED', 'PACKED'].includes(item.status) && item.terms.saleType === 'SHIPPED' ? <Button label={protocol.hasSealReference ? 'Add another seal reference' : 'Record high-resolution seal reference'} icon="camera.fill" variant={protocol.hasPackingVideo && !protocol.hasSealReference ? 'primary' : 'secondary'} onPress={() => capture('SHIPPING_LABEL')} /> : null}
    {role === 'SELLER' && ['TERMS_LOCKED', 'PACKED'].includes(item.status) ? <Button label="Optional research series (not required)" icon="camera.metering.center.weighted" variant="secondary" onPress={() => router.push({ pathname: '/capture/physical/[id]', params: { id, intent: 'REFERENCE' } })} /> : null}
    {item.status === 'TERMS_LOCKED' && item.terms.saleType === 'LOCAL_HANDOFF' ? <Button label={handoffConfirmed ? 'Handoff confirmed—waiting' : 'Confirm item changed hands'} icon="person.2.fill" disabled={handoffConfirmed} busy={busy === 'handoff'} onPress={() => run('handoff', () => callFunction('confirmLocalHandoff', { transactionId: id }).then(() => undefined))} /> : null}
    {item.status === 'TERMS_LOCKED' && item.terms.saleType === 'LOCAL_HANDOFF' && role === 'BUYER' ? <Button label="Capture received condition" icon="camera.fill" variant="secondary" onPress={() => capture('DELIVERY_PHOTO')} /> : null}
    {item.status === 'PACKED' && role === 'SELLER' ? <Button label="Add shipment details" icon="truck.box.fill" disabled={!protocol.sellerReferenceComplete} onPress={() => setShowShipping(true)} /> : null}
    {item.status === 'PACKED' && role === 'SELLER' && !protocol.sellerReferenceComplete ? <Text style={styles.small}>Shipment can be recorded after a server-finalized packing video and high-resolution seal reference are present with no byte-integrity mismatch.</Text> : null}
    {item.status === 'SHIPPED' && role === 'BUYER' ? <Button label={protocol.hasArrivalPhoto ? 'Add another arrival observation' : 'Record arrival package observation'} icon="camera.fill" onPress={() => capture('DELIVERY_PHOTO')} /> : null}
    {item.status === 'SHIPPED' && role === 'BUYER' ? <Button label="Record continuous unboxing" icon="video.fill" variant={protocol.hasArrivalPhoto ? 'primary' : 'secondary'} onPress={() => capture('UNBOXING_VIDEO')} /> : null}
    {role === 'BUYER' && ['SHIPPED', 'BUYER_REVIEW', 'DISPUTED'].includes(item.status) ? <Button label="Optional research series (not required)" icon="viewfinder" variant="secondary" onPress={() => router.push({ pathname: '/capture/physical/[id]', params: { id, intent: 'VERIFICATION' } })} /> : null}
    {item.status === 'SHIPPED' && role === 'BUYER' ? <Button label="Mark received without video" variant="secondary" busy={busy === 'received'} onPress={() => Alert.alert('Skip arrival and unboxing observations?', 'The human-reviewable package protocol is incomplete without an arrival observation and unboxing record. PackProof will not infer a physical conclusion either way.', [{ text: 'Keep capturing', style: 'cancel' }, { text: 'Mark received', onPress: () => run('received', () => callFunction('markReceived', { transactionId: id }).then(() => undefined)) }])} /> : null}
    {role === 'SELLER' && !['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <View style={styles.quickEvidence}><Text style={styles.quickLabel}>ADD SUPPORTING EVIDENCE</Text><View style={styles.choices}><Choice label="Condition" selected={false} onPress={() => capture('CONDITION_PHOTO')} /><Choice label="Identifier" selected={false} onPress={() => capture('IDENTIFIER_PHOTO')} /><Choice label="COA" selected={false} onPress={() => capture('COA_PHOTO')} />{['PACKED', 'SHIPPED'].includes(item.status) ? <Choice label="Shipping label" selected={false} onPress={() => capture('SHIPPING_LABEL')} /> : null}</View></View> : null}
    {!['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <Button label="Attach supporting PDF" icon="doc.fill" variant="secondary" busy={busy === 'document'} onPress={attachPdf} /> : null}
    {item.status === 'BUYER_REVIEW' ? <Button label={completed ? 'Completion confirmed—waiting' : 'Everything is complete'} icon="checkmark.circle.fill" disabled={completed} busy={busy === 'complete'} onPress={() => run('complete', () => callFunction('completeTransaction', { transactionId: id }).then(() => undefined))} /> : null}
    {!activeReturn && item.buyerId && ['SHIPPED', 'BUYER_REVIEW', 'COMPLETED', 'DISPUTED'].includes(item.status) && (item.terms.returns !== 'NO_RETURNS' || item.status === 'DISPUTED') ? <Button label="Start return passport" icon="arrow.uturn.backward.circle.fill" variant="secondary" onPress={() => setShowReturnRequest(true)} /> : null}
    {activeReturn?.status === 'REQUESTED' && !returnRequester ? <Button label="Authorize return passport" icon="checkmark.shield.fill" busy={busy === 'authorizeReturn'} onPress={() => run('authorizeReturn', () => callFunction('authorizeReturnPassport', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined))} /> : null}
    {activeReturn?.status === 'AUTHORIZED' && returningParticipant ? <Button label="Record continuous return repacking" icon="video.fill" onPress={() => capture('RETURN_PACKING_VIDEO', activeReturn.id)} /> : null}
    {activeReturn && ['AUTHORIZED', 'PACKED'].includes(activeReturn.status) && returningParticipant ? <Button label={returnProtocol?.hasSealReference ? 'Add another return seal reference' : 'Record high-resolution return seal reference'} icon="camera.fill" variant={returnProtocol?.hasPackingVideo && !returnProtocol.hasSealReference ? 'primary' : 'secondary'} onPress={() => capture('RETURN_SHIPPING_LABEL', activeReturn.id)} /> : null}
    {activeReturn?.status === 'PACKED' && returningParticipant ? <Button label="Add return shipment details" icon="truck.box.fill" disabled={!returnProtocol?.sellerReferenceComplete} onPress={() => setShowReturnShipping(true)} /> : null}
    {activeReturn?.status === 'PACKED' && returningParticipant && !returnProtocol?.sellerReferenceComplete ? <Text style={styles.small}>Return shipment can be recorded after a server-finalized return packing video and high-resolution seal reference are present with no byte-integrity mismatch.</Text> : null}
    {activeReturn?.status === 'IN_TRANSIT' && returnRecipient ? <Button label="Record returned-item unboxing" icon="video.fill" onPress={() => capture('RETURN_UNBOXING_VIDEO', activeReturn.id)} /> : null}
    {activeReturn?.status === 'IN_TRANSIT' && returnRecipient ? <Button label="Mark return received without video" variant="secondary" busy={busy === 'returnReceived'} onPress={() => run('returnReceived', () => callFunction('markReturnReceived', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined))} /> : null}
    {activeReturn && !['REQUESTED', 'COMPLETED', 'CANCELLED'].includes(activeReturn.status) ? <Button label="Add return condition photo" icon="camera.fill" variant="secondary" onPress={() => capture('RETURN_CONDITION_PHOTO', activeReturn.id)} /> : null}
    {activeReturn?.status === 'RECEIVED_REVIEW' ? <Button label={(activeReturn.completedBy ?? []).includes(user.uid) ? 'Return completion confirmed—waiting' : 'Complete return passport'} icon="checkmark.circle.fill" disabled={(activeReturn.completedBy ?? []).includes(user.uid)} busy={busy === 'completeReturn'} onPress={() => run('completeReturn', () => callFunction('completeReturnPassport', { transactionId: id, returnPassportId: activeReturn.id }).then(() => undefined))} /> : null}
    {!['DRAFT', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <Button label="Generate evidence packet" icon="doc.text.fill" variant="secondary" busy={busy === 'packet'} onPress={createPacket} /> : null}
    {item.buyerId && !['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(item.status) ? <Button label="Raise a concern" icon="exclamationmark.triangle.fill" variant="danger" onPress={() => setShowConcern(!showConcern)} /> : null}
    {role === 'SELLER' && ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(item.status) ? <Button label="Cancel PackProof" icon="xmark.circle.fill" variant="danger" busy={busy === 'cancel'} onPress={cancelTransaction} /> : null}
  </View>;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Button label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
    <View style={styles.top}><View style={{ flex: 1 }}><Text style={styles.role}>{role}</Text><Text style={styles.title}>{item.title}</Text></View><Text style={styles.price}>{formatMoney(item.priceMinor, item.currency)}</Text></View>
    <View style={styles.status}><StatusPill status={item.status} /><Text style={styles.updated}>Updated {formatDate(item.updatedAt)}</Text></View>
    <ProgressBar value={statusProgress[item.status]} />

    {actions}

    {showReturnRequest ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Start a symmetric return passport</Text>
      <Text style={styles.small}>The other participant must authorize this request before return repacking. The passport snapshots the original evidence hashes and creates a separate return audit trail.</Text>
      <Field label="Reason for return" value={returnReason} onChangeText={setReturnReason} multiline placeholder="Describe the return reason factually and reference the locked terms." />
      <Button label="Request return passport" busy={busy === 'requestReturn'} disabled={returnReason.trim().length < 5} onPress={() => run('requestReturn', async () => { await callFunction('initiateReturnPassport', { transactionId: id, reason: returnReason.trim() }); setShowReturnRequest(false); setReturnReason(''); })} />
      <Button label="Cancel" variant="ghost" onPress={() => setShowReturnRequest(false)} />
    </Card> : null}

    {showReturnShipping && activeReturn ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Return shipment details</Text>
      <View style={styles.choices}>{['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((value) => <Choice key={value} label={value} selected={returnCarrier === value} onPress={() => setReturnCarrier(value)} />)}</View>
      <Field label="Return tracking number" value={returnTracking} onChangeText={setReturnTracking} autoCapitalize="characters" placeholder="Enter the return tracking number" />
      <Button label="Record return shipment" busy={busy === 'returnShipping'} disabled={returnTracking.trim().length < 3} onPress={() => run('returnShipping', async () => { await callFunction('submitReturnShipping', { transactionId: id, returnPassportId: activeReturn.id, carrier: returnCarrier, trackingNumber: returnTracking.trim() }); setShowReturnShipping(false); })} />
    </Card> : null}

    {showShipping ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Shipment details</Text>
      <View style={styles.choices}>{['USPS', 'UPS', 'FedEx', 'DHL', 'Other'].map((value) => <Choice key={value} label={value} selected={carrier === value} onPress={() => setCarrier(value)} />)}</View>
      <Field label="Tracking number" value={tracking} onChangeText={setTracking} autoCapitalize="characters" placeholder="Enter the carrier tracking number" />
      <Button label="Record shipment" busy={busy === 'shipping'} disabled={tracking.trim().length < 3} onPress={() => run('shipping', async () => { await callFunction('submitShipping', { transactionId: id, carrier, trackingNumber: tracking.trim() }); setShowShipping(false); })} />
    </Card> : null}

    {showConcern ? <Card style={styles.form}>
      <Text style={styles.cardTitle}>Raise a private concern</Text>
      <Text style={styles.small}>This freezes the normal completion flow and creates a moderation record. It does not decide the dispute.</Text>
      <View style={styles.choices}>{(['FRAUD', 'HARASSMENT', 'PROHIBITED_ITEM', 'IMPERSONATION', 'PRIVACY', 'OTHER'] as const).map((value) => <Choice key={value} label={formatRuntimeEnum(value).toLowerCase()} selected={concernReason === value} onPress={() => setConcernReason(value)} />)}</View>
      <Field label="What happened?" value={concernDetails} onChangeText={setConcernDetails} multiline placeholder="Describe the issue factually and reference relevant evidence." />
      <Button label="Submit concern" variant="danger" busy={busy === 'concern'} disabled={concernDetails.trim().length < 5} onPress={() => run('concern', async () => { await callFunction('raiseConcern', { transactionId: id, targetUserId: role === 'SELLER' ? item.buyerId : item.sellerId, reason: concernReason, details: concernDetails.trim() }); setShowConcern(false); })} />
      <Button label="Block the other participant" variant="ghost" busy={busy === 'block'} onPress={() => Alert.alert('Block this user?', 'They will be unable to join new PackProofs with you. Existing shared records remain available to both parties.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => run('block', () => callFunction('blockUser', { targetUserId: role === 'SELLER' ? item.buyerId : item.sellerId }).then(() => undefined)) }])} />
    </Card> : null}

    <Card style={styles.card}>
      <Text style={styles.cardEyebrow}>AGREED ITEM</Text>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.body}>{item.description || 'No additional description supplied.'}</Text>
      <View style={styles.divider} />
      <Info label="Category" value={item.category} /><Info label="Seller" value={shortId(item.sellerId)} /><Info label="Buyer" value={shortId(item.buyerId)} />
      {item.identifiers.map((identifier) => <Info key={`${identifier.label}:${identifier.value}`} label={identifier.label} value={identifier.value} />)}
      <Info label="Condition" value={item.conditionNotes || 'No condition notes supplied.'} vertical />
    </Card>

    <Card style={styles.card}>
      <Text style={styles.cardEyebrow}>LOCKED TERMS</Text>
      <Info label="Fulfillment" value={item.terms.saleType === 'SHIPPED' ? 'Shipped transaction' : 'Local handoff'} />
      <Info label="Shipping cost" value={formatRuntimeEnum(item.terms.shippingResponsibility).toLowerCase()} />
      <Info label="Returns" value={`${formatRuntimeEnum(item.terms.returns).toLowerCase()} · ${item.terms.returnWindowDays} day window`} />
      <Info label="Additional terms" value={item.terms.customTerms || 'No additional terms.'} vertical />
      <View style={styles.confirmations}><Text style={styles.confirmation}>{item.confirmedBy.includes(item.sellerId) ? '✓' : '○'} Seller</Text><Text style={styles.confirmation}>{item.buyerId && item.confirmedBy.includes(item.buyerId) ? '✓' : '○'} Buyer</Text></View>
      {item.terms.saleType === 'LOCAL_HANDOFF' ? <><Text style={styles.cardEyebrow}>HANDOFF CONFIRMATIONS</Text><View style={styles.confirmations}><Text style={styles.confirmation}>{item.handoffConfirmedBy?.includes(item.sellerId) ? '✓' : '○'} Seller</Text><Text style={styles.confirmation}>{item.buyerId && item.handoffConfirmedBy?.includes(item.buyerId) ? '✓' : '○'} Buyer</Text></View></> : null}
    </Card>

    {returnPassports.length ? <Card style={styles.card}>
      <Text style={styles.cardEyebrow}>SYMMETRIC RETURN PASSPORT</Text>
      {returnPassports.map((passport) => <View key={passport.id} style={styles.returnRow}>
        <View style={{ flex: 1, gap: 3 }}><Text style={styles.cardTitle}>{formatRuntimeEnum(passport.status)}</Text><Text style={styles.small}>{passport.reason}</Text>{passport.shipping ? <Text style={styles.small}>{passport.shipping.carrier} · {passport.shipping.trackingNumber}{passport.shipping.labelEvidenceMatchStatus ? ` · label ${formatRuntimeEnum(passport.shipping.labelEvidenceMatchStatus).toLowerCase()}` : ''}</Text> : null}<Text style={styles.hash}>{passport.originalEvidenceHashes?.length ?? 0} ORIGINAL EVIDENCE HASHES SNAPSHOTTED</Text></View>
        <Text style={styles.updated}>{formatDate(passport.updatedAt)}</Text>
      </View>)}
    </Card> : null}

    {item.shipping ? <Card style={styles.card}><Text style={styles.cardEyebrow}>SHIPMENT</Text><Info label="Carrier" value={item.shipping.carrier} /><Info label="Tracking" value={item.shipping.trackingNumber} />{item.shipping.labelEvidenceMatchStatus ? <Info label="Packing-label check" value={formatRuntimeEnum(item.shipping.labelEvidenceMatchStatus).toLowerCase()} /> : null}<Info label="Recorded" value={formatDate(item.shipping.shippedAt)} /></Card> : null}

    {item.terms.saleType === 'SHIPPED' && !['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW', 'CANCELLED'].includes(item.status) ? <Card style={styles.card}>
      <Text style={styles.cardEyebrow}>HUMAN-REVIEWABLE PACKAGE OBSERVATIONS</Text>
      <Text style={styles.cardTitle}>{protocol.outboundComplete ? 'Seller reference and buyer arrival records are present' : 'Guided package-seal protocol'}</Text>
      <Text style={styles.body}>{HUMAN_REVIEW_DISCLAIMER}</Text>
      <Info label="Seller packing video" value={protocol.hasPackingVideo ? 'Present' : 'Not yet finalized'} />
      <Info label="Seller seal reference" value={protocol.hasSealReference ? 'Present' : 'Not yet finalized'} />
      <Info label="Buyer arrival observation" value={protocol.hasArrivalPhoto ? 'Present' : 'Not yet finalized'} />
      <Info label="Buyer unboxing video" value={protocol.hasUnboxingVideo ? 'Present' : 'Not yet finalized'} />
      {reviewGroups.sellerReference.length || reviewGroups.buyerArrival.length ? <>
        <View style={styles.divider} />
        <Text style={styles.cardEyebrow}>SELLER REFERENCE</Text>
        {reviewGroups.sellerReference.length ? reviewGroups.sellerReference.map((record) => <Info key={record.id} label={evidenceLabels[record.type]} value={`${record.sha256.slice(0, 12)}… · ${formatDate(record.createdAt)}`} />) : <Text style={styles.small}>No seller packing or seal reference has been server-finalized.</Text>}
        <Text style={styles.cardEyebrow}>BUYER ARRIVAL</Text>
        {reviewGroups.buyerArrival.length ? reviewGroups.buyerArrival.map((record) => <Info key={record.id} label={evidenceLabels[record.type]} value={`${record.sha256.slice(0, 12)}… · ${formatDate(record.createdAt)}`} />) : <Text style={styles.small}>No buyer arrival or unboxing observation has been server-finalized.</Text>}
      </> : null}
    </Card> : null}

    <Card style={styles.card}>
      <Text style={styles.cardEyebrow}>SISV PHYSICAL OBSERVATION RESEARCH</Text>
      <Text style={styles.cardTitle}>{physicalStatus ? formatRuntimeEnum(physicalStatus.observationStatus) : 'STATUS UNAVAILABLE'}</Text>
      <Text style={styles.body}>{physicalStatus?.reason === 'COMPARISON_NOT_ENABLED'
        ? 'Reference and verification acquisition sets are present. This build preserves the observations but does not produce a physical-comparison measurement. SISV does not determine cause, actor, fraud, fault, authenticity, custody, risk, or any transaction or claim outcome.'
        : physicalStatus?.reason === 'NO_REFERENCE_CAPTURE'
          ? 'No reference series has been server-finalized.'
          : physicalStatus?.reason === 'NO_VERIFICATION_CAPTURE'
            ? 'A reference series is present; no verification series has been server-finalized.'
            : physicalStatus?.reason?.includes('INCOMPLETE')
              ? 'A physical acquisition series is incomplete. Fifteen finalized frames are required by the frozen profile.'
              : 'The physical research status could not be retrieved. Evidence files remain independently visible below.'}</Text>
      <Info label="Reference frames" value={physicalStatus?.reference ? `${physicalStatus.reference.usableFrameCount}/15${physicalStatus.reference.complete ? ' complete' : ''}` : 'None'} />
      <Info label="Verification frames" value={physicalStatus?.verification ? `${physicalStatus.verification.usableFrameCount}/15${physicalStatus.verification.complete ? ' complete' : ''}` : 'None'} />
      <Info label="SISV comparison" value="Not enabled; no measurement or adjudication emitted" />
    </Card>

    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Evidence and assurance</Text><Text style={styles.count}>{evidence.length} FILE{evidence.length === 1 ? '' : 'S'}</Text></View>
    <View style={styles.list}>
      {evidence.map((record) => {
        const byteIntegrity = byteIntegrityLabel(record);
        const acquisitionQuality = record.assurance?.acquisitionQuality.status ?? 'NOT EVALUATED';
        const physicalCorrespondence = record.assurance?.physicalCorrespondence.status ?? 'NOT AVAILABLE';
        const businessRelevance = record.assurance?.businessLegalRelevance.status ?? 'REVIEW REQUIRED';
        return <Card key={record.id} style={styles.evidence}>
        <View style={styles.evidenceIcon}><AppIcon name={record.contentType.startsWith('video') ? 'video.fill' : record.contentType === 'application/pdf' ? 'doc.fill' : 'photo.fill'} size={21} tintColor={colors.teal} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.evidenceTitle}>{evidenceLabels[record.type]}</Text>
          <Text style={styles.hash}>FILE SHA-256 · {record.sha256.slice(0, 16)}…</Text>
          {record.manifestSha256 ? <Text style={styles.hash}>MANIFEST · {record.manifestSha256.slice(0, 16)}…</Text> : null}
          <View style={styles.verificationRow}>
            <Text style={[styles.verification, byteIntegrity === 'MISMATCH' && styles.verificationDanger]}>BYTE INTEGRITY {formatRuntimeEnum(byteIntegrity)}</Text>
            <Text style={styles.verification}>{attestationLabel(record)}</Text>
            <Text style={styles.verification}>ACQUISITION {formatRuntimeEnum(acquisitionQuality)}</Text>
            <Text style={styles.verificationWarning}>PHYSICAL {formatRuntimeEnum(physicalCorrespondence)}</Text>
            {trackingLabel(record) ? <Text style={[styles.verification, trackingStatus(record) === 'MISMATCH' && styles.verificationDanger]}>{trackingLabel(record)}</Text> : <Text style={styles.verification}>CARRIER CONTEXT NONE</Text>}
            <Text style={styles.verificationWarning}>BUSINESS/LEGAL {formatRuntimeEnum(businessRelevance)}</Text>
          </View>
          <Text style={styles.evidenceMeta}>{formatDate(record.createdAt)} · {(record.sizeBytes / 1024 / 1024).toFixed(1)} MB</Text>
        </View>
        <Text onPress={() => downloadUrl(record.storagePath).then(Linking.openURL).catch((error) => Alert.alert('Could not open evidence', readableError(error)))} style={styles.open}>OPEN</Text>
      </Card>;})}
      {!evidence.length ? <Card><Text style={styles.small}>No evidence has been server-finalized yet. Files appear here only after upload, access checks, independent hashing, media-type inspection, and service-authenticated manifest creation complete.</Text></Card> : null}
      {hashes.size !== evidence.length ? <Text style={styles.warning}>Duplicate evidence fingerprints detected. This does not change the original files.</Text> : null}
    </View>

    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Audit timeline</Text></View>
    <Card style={styles.timeline}>{events.map((event, index) => <View key={event.id} style={styles.event}><View style={styles.eventRail}><View style={styles.eventDot} />{index < events.length - 1 ? <View style={styles.eventLine} /> : null}</View><View style={{ flex: 1, paddingBottom: 17 }}><Text style={styles.eventType}>{formatRuntimeEnum(event.type)}</Text><Text style={styles.eventSummary}>{event.summary}</Text><Text style={styles.eventDate}>{formatDate(event.createdAt)}</Text></View></View>)}</Card>
  </ScrollView></SafeAreaView>;
}

function Info({ label, value, vertical }: { label: string; value: string; vertical?: boolean }) {
  return <View style={[styles.info, vertical && { flexDirection: 'column', gap: 5 }]}><Text style={styles.infoLabel}>{label}</Text><Text selectable style={[styles.infoValue, vertical && { textAlign: 'left' }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 48, gap: 15 }, back: { alignSelf: 'flex-start', minHeight: 40 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, role: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 5 }, title: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '900' }, price: { color: colors.teal, fontSize: 18, fontWeight: '900' },
  status: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, updated: { color: colors.muted, fontSize: 10 }, actions: { gap: 9, marginVertical: 4 }, quickEvidence: { gap: 8, paddingTop: 3 }, quickLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, form: { gap: 14 }, choices: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  card: { gap: 10 }, cardEyebrow: { color: colors.teal, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 }, cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, divider: { height: 1, backgroundColor: colors.border },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, infoLabel: { color: colors.muted, fontSize: 12, fontWeight: '700' }, infoValue: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18, textAlign: 'right', fontWeight: '600' }, confirmations: { flexDirection: 'row', gap: 16, marginTop: 5 }, confirmation: { color: colors.teal, fontSize: 12, fontWeight: '800' },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 }, sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '900' }, count: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, list: { gap: 9 },
  evidence: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 }, evidenceIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'rgba(70,124,99,0.08)', alignItems: 'center', justifyContent: 'center' }, evidenceTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, hash: { color: colors.teal, fontSize: 9, marginTop: 3 }, verificationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }, verification: { color: colors.muted, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 7, fontWeight: '900', letterSpacing: 0.45 }, verificationWarning: { color: colors.amber, borderWidth: 1, borderColor: colors.amber, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, fontSize: 7, fontWeight: '900', letterSpacing: 0.45 }, verificationDanger: { color: colors.danger, borderColor: colors.danger }, evidenceMeta: { color: colors.muted, fontSize: 9, marginTop: 5 }, open: { color: colors.blue, fontSize: 10, fontWeight: '900' },
  small: { color: colors.muted, fontSize: 11, lineHeight: 17 }, warning: { color: colors.amber, fontSize: 10 },
  returnRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  timeline: { gap: 0 }, event: { flexDirection: 'row', gap: 10 }, eventRail: { width: 16, alignItems: 'center' }, eventDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.teal, marginTop: 3 }, eventLine: { width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 }, eventType: { color: colors.ink, fontSize: 11, fontWeight: '900' }, eventSummary: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 }, eventDate: { color: colors.muted, opacity: 0.7, fontSize: 9, marginTop: 4 },
});
