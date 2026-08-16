import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { AppIcon } from '@/components/app-icon';
import { Button, Card, ProgressBar, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { prepareCaptureAttestation, prepareEvidenceSessionAttestation } from '@/lib/api';
import { startCaptureTelemetry } from '@/lib/capture-telemetry';
import {
  PHYSICAL_CAPTURE_FRAME_COUNT,
  PHYSICAL_CAPTURE_PROFILE_ID,
  PHYSICAL_CAPTURE_PROFILE_VERSION,
  PHYSICAL_FRAMES_PER_REGION,
  PHYSICAL_QUALITY_POLICY_ID,
  PHYSICAL_REGION_PLAN,
  clientDimensionGate,
  type PhysicalCaptureIntent,
  type PhysicalRegionId,
} from '@/lib/capture-profiles';
import {
  canDiscardPhysicalSeries,
  canTransitionPhysicalCaptureStage,
  physicalSeriesIsComplete,
  shouldDeletePhysicalFramesOnUnmount,
  shouldDeletePhysicalOriginalsAfterSeriesCommit,
  shouldDeletePhysicalSourceAfterEachEncrypt,
  type PhysicalCaptureStage,
} from '@/lib/capture-workflow';
import { discardQueuedEvidence, enqueueEvidence, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import type { CaptureAttestation, CaptureManifestInput } from '@/types/telemetry';
import { analyzeImageQuality, type ImageQualitySignals } from 'packproof-secure-file';

type CapturedFrame = {
  uri: string;
  width: number | null;
  height: number | null;
  regionId: PhysicalRegionId;
  globalFrameIndex: number;
  frameWithinRegion: number;
  attempt: number;
  captureStartedAt: string;
  captureFinishedAt: string;
  monotonicElapsedMs: number;
  qualitySignals: ImageQualitySignals;
};

type CompletedTelemetry = Awaited<ReturnType<Awaited<ReturnType<typeof startCaptureTelemetry>>['finish']>>;

function offlineBatchAttestation(captureGroupId: string): CaptureAttestation {
  const now = new Date().toISOString();
  return {
    mode: 'OFFLINE_UNATTESTED',
    captureSessionId: null,
    nonce: Crypto.randomUUID(),
    appId: null,
    issuedAt: now,
    captureWindowEndsAt: null,
    tokenReplayDetected: null,
    reasonCodes: ['NO_NETWORK'],
    deviceKeyProof: null,
    sessionMode: 'BATCH',
    maxEvidenceCount: PHYSICAL_CAPTURE_FRAME_COUNT,
    captureGroupId,
  };
}

export default function PhysicalCaptureScreen() {
  const {
    id,
    intent: rawIntent,
    evidenceSessionId,
    evidenceSessionToken,
    evidenceSessionOperationKey,
    evidenceCaptureGroupId,
  } = useLocalSearchParams<{
    id: string;
    intent?: PhysicalCaptureIntent;
    evidenceSessionId?: string;
    evidenceSessionToken?: string;
    evidenceSessionOperationKey?: string;
    evidenceCaptureGroupId?: string;
  }>();
  const intent: PhysicalCaptureIntent = rawIntent === 'VERIFICATION' ? 'VERIFICATION' : 'REFERENCE';
  const router = useRouter();
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const collectorRef = useRef<Awaited<ReturnType<typeof startCaptureTelemetry>> | null>(null);
  const framesRef = useRef<CapturedFrame[]>([]);
  const mountedRef = useRef(true);
  const securingRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<PhysicalCaptureStage>('INTRO');
  const goTo = (next: PhysicalCaptureStage) => {
    setStage((current) => (canTransitionPhysicalCaptureStage(current, next) ? next : current));
  };
  const [includeLocation, setIncludeLocation] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [completedTelemetry, setCompletedTelemetry] = useState<CompletedTelemetry | null>(null);
  const [attestation, setAttestation] = useState<CaptureAttestation | null>(null);
  const [captureGroupId] = useState(() => evidenceCaptureGroupId || `pcg_${Crypto.randomUUID()}`);
  const [attempt, setAttempt] = useState(1);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const collector = collectorRef.current;
      collectorRef.current = null;
      if (collector) void collector.finish().catch(() => undefined);
      if (shouldDeletePhysicalFramesOnUnmount(securingRef.current, framesRef.current.length)) {
        const temporaryFrames = framesRef.current;
        framesRef.current = [];
        void Promise.all(temporaryFrames.map((frame) => FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => undefined)));
      }
    };
  }, []);

  const currentRegionIndex = Math.min(Math.floor(frames.length / PHYSICAL_FRAMES_PER_REGION), PHYSICAL_REGION_PLAN.length - 1);
  const currentRegion = PHYSICAL_REGION_PLAN[currentRegionIndex];
  const currentFrameWithinRegion = (frames.length % PHYSICAL_FRAMES_PER_REGION) + 1;

  const changeLocationPreference = async (enabled: boolean) => {
    if (!enabled) { setIncludeLocation(false); return; }
    const result = await Location.requestForegroundPermissionsAsync();
    if (!result.granted) {
      setIncludeLocation(false);
      Alert.alert('Location not included', 'The physical capture can continue without precise location.');
      return;
    }
    setIncludeLocation(true);
  };

  const begin = async () => {
    if (!id) return;
    setPreparing(true);
    try {
      const cameraPermission = permission?.granted ? permission : await requestPermission();
      if (!cameraPermission?.granted) {
        Alert.alert('Camera required', 'PackProof needs camera access to acquire the guided SISV observation regions.');
        return;
      }
      const collector = await startCaptureTelemetry(includeLocation);
      if (!mountedRef.current) {
        await collector.finish().catch(() => undefined);
        return;
      }
      collectorRef.current = collector;
      let preparedAttestation: CaptureAttestation;
      try {
        preparedAttestation = evidenceSessionId && evidenceSessionToken && evidenceSessionOperationKey
          ? await prepareEvidenceSessionAttestation({
            evidenceSessionId,
            token: evidenceSessionToken,
            operationKey: evidenceSessionOperationKey,
            runtimeIntegrity: collector.runtimeIntegrity,
          })
          : await prepareCaptureAttestation({
            transactionId: id,
            runtimeIntegrity: collector.runtimeIntegrity,
            captureProfileId: PHYSICAL_CAPTURE_PROFILE_ID,
            captureGroupId,
            requestedEvidenceCount: PHYSICAL_CAPTURE_FRAME_COUNT,
          });
      } catch (error) {
        if (evidenceSessionId) {
          await collector.finish().catch(() => undefined);
          collectorRef.current = null;
          throw error;
        }
        const network = await NetInfo.fetch();
        if (network.isConnected === false || network.isInternetReachable === false) {
          preparedAttestation = offlineBatchAttestation(captureGroupId);
        } else {
          await collector.finish().catch(() => undefined);
          collectorRef.current = null;
          throw error;
        }
      }
      if (!mountedRef.current) return;
      setAttestation(preparedAttestation);
      setCameraReady(false);
      setCameraError(null);
      goTo('CAMERA');
    } catch (error) {
      if (mountedRef.current) Alert.alert('Could not start physical capture', readableError(error));
    } finally {
      if (mountedRef.current) setPreparing(false);
    }
  };

  const takeFrame = async () => {
    if (!camera.current || !cameraReady || cameraError || preparing || !currentRegion) return;
    setPreparing(true);
    let uri: string | null = null;
    try {
      const captureStartedAt = new Date().toISOString();
      const monotonicStartedAt = performance.now();
      const picture = await camera.current.takePictureAsync({ quality: 1, exif: false, shutterSound: true });
      uri = picture?.uri ?? null;
      if (!picture?.uri) throw new Error('The camera returned no image.');
      if (!mountedRef.current) {
        await FileSystem.deleteAsync(picture.uri, { idempotent: true }).catch(() => undefined);
        uri = null;
        return;
      }
      const captureFinishedAt = new Date().toISOString();
      const monotonicElapsedMs = Math.max(0, Math.round(performance.now() - monotonicStartedAt));
      const quality = clientDimensionGate(picture.width ?? null, picture.height ?? null);
      if (quality.gate === 'CLIENT_DIMENSION_FAIL') {
        await FileSystem.deleteAsync(picture.uri, { idempotent: true }).catch(() => undefined);
        uri = null;
        setAttempt((value) => value + 1);
        Alert.alert('Retake this frame', 'The image dimensions are below the minimum capture gate for the research profile. Move closer only if needed, keep the full requested patch in frame, and retake.');
        return;
      }
      const qualitySignals = await analyzeImageQuality(picture.uri);
      if (!mountedRef.current) {
        await FileSystem.deleteAsync(picture.uri, { idempotent: true }).catch(() => undefined);
        uri = null;
        return;
      }

      const nextFrame: CapturedFrame = {
        uri: picture.uri,
        width: picture.width ?? null,
        height: picture.height ?? null,
        regionId: currentRegion.id,
        globalFrameIndex: frames.length,
        frameWithinRegion: currentFrameWithinRegion,
        attempt,
        captureStartedAt,
        captureFinishedAt,
        monotonicElapsedMs,
        qualitySignals,
      };
      const next = [...frames, nextFrame];
      if (physicalSeriesIsComplete(next.length, PHYSICAL_CAPTURE_FRAME_COUNT)) {
        const collector = collectorRef.current;
        if (!collector) throw new Error('Capture telemetry collector was unavailable at finalization.');
        collectorRef.current = null;
        const telemetry = await collector.finish();
        if (!mountedRef.current) {
          await FileSystem.deleteAsync(picture.uri, { idempotent: true }).catch(() => undefined);
          uri = null;
          return;
        }
        setCompletedTelemetry(telemetry);
      }
      framesRef.current = next;
      setFrames(next);
      setAttempt(1);
      if (physicalSeriesIsComplete(next.length, PHYSICAL_CAPTURE_FRAME_COUNT)) {
        goTo('REVIEW');
      }
    } catch (error) {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      if (mountedRef.current) Alert.alert('Frame capture failed', readableError(error));
    } finally {
      if (mountedRef.current) setPreparing(false);
    }
  };

  const discard = async () => {
    if (!canDiscardPhysicalSeries(stage, securingRef.current)) return;
    if (collectorRef.current) await collectorRef.current.finish().catch(() => undefined);
    collectorRef.current = null;
    await Promise.all(frames.map((frame) => FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => undefined)));
    framesRef.current = [];
    setFrames([]);
    setCompletedTelemetry(null);
    router.back();
  };

  const secureSeries = async () => {
    if (!id || !user || !completedTelemetry || !attestation || !physicalSeriesIsComplete(frames.length, PHYSICAL_CAPTURE_FRAME_COUNT)) return;
    securingRef.current = true;
    goTo('SECURING');
    setProgress(0);
    const queuedIds: string[] = [];
    let encryptedSeriesCommitted = false;
    try {
      for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        const clientImage = clientDimensionGate(frame.width, frame.height);
        const manifest: CaptureManifestInput = {
          schemaVersion: 2,
          captureId: Crypto.randomUUID(),
          captureStartedAt: frame.captureStartedAt,
          captureFinishedAt: frame.captureFinishedAt,
          time: {
            deviceWallStartedAt: frame.captureStartedAt,
            deviceWallFinishedAt: frame.captureFinishedAt,
            monotonicElapsedMs: frame.monotonicElapsedMs,
            deviceWallProvenance: 'CLIENT_OBSERVED_UNTRUSTED',
            monotonicProvenance: 'CLIENT_OBSERVED_RELATIVE_ONLY',
            serverTimeProvenance: 'ADDED_AT_RECEIPT_AND_FINALIZATION',
          },
          runtimeIntegrity: completedTelemetry.runtimeIntegrity,
          sensorFusion: completedTelemetry.sensorFusion,
          networkTelemetry: completedTelemetry.networkTelemetry,
          geolocation: completedTelemetry.geolocation,
          shippingLabel: null,
          attestation,
          captureProfile: {
            profileId: 'packproof-digital-evidence',
            profileVersion: '2.0.0',
            profileScope: 'HUMAN_GUIDED_DIGITAL_EVIDENCE',
            requestedRegions: PHYSICAL_REGION_PLAN.map((region) => region.id),
            observedRegions: [frame.regionId],
            regionObservationMethod: 'USER_GUIDED_NOT_MACHINE_CONFIRMED',
            attempt: frame.attempt,
          },
          cameraObservation: {
            source: 'EXPO_CAMERA_ORIGINAL_OUTPUT',
            facing: 'BACK',
            mode: 'PHOTO',
            widthPixels: frame.width,
            heightPixels: frame.height,
            orientation: null,
            flashMode: 'OFF',
            zoom: 0,
            codec: 'PLATFORM_DEFAULT',
            metadataScope: 'LIMITED_BY_EXPO_CAMERA',
            packProofTransformationsBeforeHashing: 'NONE',
          },
          acquisitionQuality: {
            status: 'NOT_EVALUATED',
            qualityProfileId: 'none',
            qualityProfileVersion: '0',
            reasonCodes: ['NO_CALIBRATED_QUALITY_GATE'],
          },
          physicalCorrespondence: {
            status: 'NOT_AVAILABLE',
            mode: 'PRODUCTION_DISABLED',
            reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'],
          },
          physicalCaptureProfile: {
            profileId: PHYSICAL_CAPTURE_PROFILE_ID,
            profileVersion: PHYSICAL_CAPTURE_PROFILE_VERSION,
            qualityPolicyId: PHYSICAL_QUALITY_POLICY_ID,
            intendedUse: intent,
            captureGroupId,
            acquisitionMode: 'GUIDED_MULTI_FRAME',
            requestedRegions: PHYSICAL_REGION_PLAN.map((region) => region.id),
            observedRegion: frame.regionId,
            frameIndex: frame.globalFrameIndex,
            framesPerRegion: PHYSICAL_FRAMES_PER_REGION,
            totalFrameCount: PHYSICAL_CAPTURE_FRAME_COUNT,
            captureAttempt: frame.attempt,
            clientImage: { ...clientImage, qualitySignals: frame.qualitySignals },
          },
        };
        const item = await enqueueEvidence({
          transactionId: id,
          uploaderId: user.uid,
          evidenceType: intent === 'REFERENCE' ? 'PHYSICAL_REFERENCE_FRAME' : 'PHYSICAL_VERIFICATION_FRAME',
          localUri: frame.uri,
          contentType: 'image/jpeg',
          originalName: `physical-${intent.toLowerCase()}-${frame.regionId.toLowerCase()}-${frame.frameWithinRegion}-${Date.now()}.jpg`,
          manifest,
          captureSessionId: attestation.captureSessionId,
          deleteSourceAfterEncrypt: shouldDeletePhysicalSourceAfterEachEncrypt(),
        });
        queuedIds.push(item.id);
        if (mountedRef.current) setProgress(((index + 1) / frames.length) * 0.45);
      }

      // From this point forward the complete original series has a durable,
      // encrypted local representation. Network/finalization failures must
      // never roll those queue records back merely because synchronization did
      // not finish in the same UI session.
      encryptedSeriesCommitted = true;
      if (shouldDeletePhysicalOriginalsAfterSeriesCommit(encryptedSeriesCommitted)) {
        await Promise.all(frames.map((frame) => FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => undefined)));
        framesRef.current = [];
        if (mountedRef.current) {
          setFrames([]);
          setProgress(0.5);
        }
      }
      const result = await syncEvidenceQueue();
      const thisBatchFinalized = queuedIds.filter((queueId) => result.uploadedIds.includes(queueId)).length;
      if (mountedRef.current) {
        setProgress(1);
        Alert.alert(
          thisBatchFinalized === queuedIds.length ? 'Physical capture finalized' : 'Physical capture protected',
          thisBatchFinalized === queuedIds.length
            ? 'All 15 original frames were independently hashed, server-finalized, and sealed into PackProof manifests. SISV comparison measurements remain validation-gated and cannot determine cause, actor, fraud, fault, authenticity, custody, or disposition.'
            : 'All 15 originals are encrypted in PackProof’s private queue. Any frame not yet server-finalized will retry automatically without changing its evidentiary identity.',
          [{ text: 'Done', onPress: () => router.replace(`/transaction/${id}`) }],
        );
      }
      securingRef.current = false;
    } catch (error) {
      if (!encryptedSeriesCommitted) {
        // The encrypted series was incomplete, so remove only queue records that
        // are still safe to discard. The original camera files remain available
        // for a complete retry.
        await Promise.allSettled(queuedIds.map((queueId) => discardQueuedEvidence(queueId)));
        if (mountedRef.current) {
          goTo('REVIEW');
          Alert.alert('Could not secure the full series', `${readableError(error)} The original camera files were retained so the complete series can be retried.`);
        }
      } else {
        // A complete encrypted series exists. Preserve it even if immediate
        // network synchronization fails; the background/foreground queue will
        // retry without changing frame identity.
        if (mountedRef.current) {
          setProgress(1);
          Alert.alert(
            'Physical capture protected',
            `${readableError(error)} The complete 15-frame series remains encrypted in PackProof’s private queue and will retry synchronization without changing its evidentiary identity.`,
            [{ text: 'Done', onPress: () => router.replace(`/transaction/${id}`) }],
          );
        }
      }
      securingRef.current = false;
      if (!mountedRef.current && !encryptedSeriesCommitted) {
        await Promise.all(frames.map((frame) => FileSystem.deleteAsync(frame.uri, { idempotent: true }).catch(() => undefined)));
        framesRef.current = [];
      }
    }
  };

  if (stage === 'CAMERA') {
    return <View style={styles.cameraPage}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode="picture" flash="off" zoom={0} onCameraReady={() => { setCameraReady(true); setCameraError(null); }} onMountError={({ message }) => { setCameraReady(false); setCameraError(message); }} />
      <SafeAreaView style={styles.overlay}>
        <View style={styles.cameraHeader}>
          <Pressable onPress={discard} disabled={preparing} style={styles.circleButton}><AppIcon name="xmark" size={18} tintColor={colors.white} /></Pressable>
          <View style={styles.counterBadge}><Text style={styles.counterText}>{frames.length + 1} / {PHYSICAL_CAPTURE_FRAME_COUNT}</Text></View>
        </View>
        <View style={styles.guideWrap}>
          <View style={styles.guideBox} />
          <Text style={styles.regionTitle}>{currentRegion.title}</Text>
          <Text style={styles.regionInstruction}>{currentRegion.instruction}</Text>
          <Text style={styles.frameText}>FRAME {currentFrameWithinRegion} OF {PHYSICAL_FRAMES_PER_REGION}</Text>
        </View>
        <View style={styles.cameraFooter}>
          <Text style={styles.cameraHelp}>{cameraError ? `The camera preview could not start: ${cameraError}` : !cameraReady ? 'Waiting for the native camera preview before capture is enabled.' : 'Keep the requested physical patch sharp and evenly lit. Small viewpoint differences between the three frames are useful; do not digitally zoom.'}</Text>
          <Pressable accessibilityLabel="Capture physical evidence frame" onPress={takeFrame} disabled={preparing || !cameraReady || Boolean(cameraError)} style={[styles.shutter, (preparing || !cameraReady || Boolean(cameraError)) && { opacity: 0.5 }]}><View style={styles.shutterInner} /></Pressable>
        </View>
      </SafeAreaView>
    </View>;
  }

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Button label="Close" variant="ghost" onPress={() => router.back()} style={styles.close} disabled={stage === 'SECURING'} />
    {stage === 'INTRO' ? <>
      <ScreenTitle eyebrow="SISV observation acquisition" title={intent === 'REFERENCE' ? 'Record the reference surface' : 'Record the comparison surface'} subtitle="PackProof will capture five predefined regions, three original frames per region. This preserves a reproducible evidence set; it does not determine identity, authenticity, tampering, fraud, fault, custody, or any transaction outcome." />
      <Card style={styles.profileCard}>
        <Text style={styles.profileId}>{PHYSICAL_CAPTURE_PROFILE_ID} · v{PHYSICAL_CAPTURE_PROFILE_VERSION}</Text>
        <Text style={styles.profileText}>Initial research scope: matte or low-gloss paper label on ordinary paperboard/cardboard. Glossy film, metallic, transparent, wet, severely damaged, or unknown substrates should not be treated as validated.</Text>
      </Card>
      <Card style={styles.regionList}>{PHYSICAL_REGION_PLAN.map((region, index) => <View key={region.id} style={styles.regionRow}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><View style={{ flex: 1, gap: 3 }}><Text style={styles.regionRowTitle}>{region.title}</Text><Text style={styles.regionRowText}>{region.rationale}</Text></View></View>)}</Card>
      <Card style={styles.locationCard}><View style={{ flex: 1, gap: 4 }}><Text style={styles.locationTitle}>Include precise location</Text><Text style={styles.locationText}>Optional and privacy-sensitive. Location corroborates context only; it does not prove custody or scene truth.</Text></View><Switch value={includeLocation} onValueChange={(value) => changeLocationPreference(value).catch((error) => Alert.alert('Could not change location setting', readableError(error)))} /></Card>
      <Card style={styles.caution}><AppIcon name="exclamationmark.triangle.fill" size={20} tintColor={colors.amber} /><Text style={styles.cautionText}>Use supported matte/low-gloss regions only. If glare, blur, severe damage, or unsupported material prevents a reliable acquisition, the scientifically correct result is unsupported, failure-to-acquire, or inconclusive—not a forced match.</Text></Card>
      <Button label={preparing ? 'Preparing attested capture…' : 'Begin 15-frame guided capture'} icon="viewfinder" onPress={begin} disabled={preparing} />
    </> : null}
    {stage === 'REVIEW' ? <>
      <ScreenTitle eyebrow="Acquisition complete" title="Secure the 15 original frames?" subtitle="Each frame will be encrypted with Android Keystore AES-256-GCM, independently SHA-256 hashed, assigned its own exact upload binding, and retained locally until server finalization is confirmed." />
      <Card style={styles.reviewCard}><AppIcon name="checkmark.shield.fill" size={44} tintColor={colors.teal} /><Text style={styles.reviewTitle}>{PHYSICAL_CAPTURE_FRAME_COUNT} / {PHYSICAL_CAPTURE_FRAME_COUNT} frames captured</Text><Text style={styles.reviewText}>{attestation?.mode === 'JIT_APP_CHECK' ? 'Fresh App Check batch attestation is bound to the capture series.' : 'The series was acquired offline and will remain explicitly OFFLINE_UNATTESTED after synchronization.'}</Text><Text style={styles.reviewText}>This build preserves the observations without producing a physical-comparison measurement or a conclusion about either participant.</Text></Card>
      <Button label="Encrypt, hash and sync series" icon="lock.shield.fill" onPress={secureSeries} />
      <Button label="Discard series" variant="danger" onPress={discard} />
    </> : null}
    {stage === 'SECURING' ? <View style={styles.securing}><AppIcon name="lock.shield.fill" size={48} tintColor={colors.teal} /><Text style={styles.secureTitle}>Securing physical evidence</Text><Text style={styles.percent}>{Math.round(progress * 100)}%</Text><ProgressBar value={progress} /><Text style={styles.secureText}>Encrypted originals remain in private app storage until the corresponding server evidence records are finalized. A Storage upload by itself is not treated as completion.</Text></View> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, container: { padding: 20, paddingBottom: 48, gap: 15 }, close: { alignSelf: 'flex-start', minHeight: 40 },
  profileCard: { gap: 8 }, profileId: { color: colors.teal, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 }, profileText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  regionList: { gap: 15 }, regionRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' }, number: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(70,124,99,0.1)', alignItems: 'center', justifyContent: 'center' }, numberText: { color: colors.teal, fontSize: 11, fontWeight: '900' }, regionRowTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, regionRowText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, locationTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, locationText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  caution: { flexDirection: 'row', gap: 11, backgroundColor: 'rgba(138,91,0,0.06)' }, cautionText: { flex: 1, color: colors.amber, fontSize: 11, lineHeight: 17 },
  cameraPage: { flex: 1, backgroundColor: colors.black }, overlay: { flex: 1, justifyContent: 'space-between' }, cameraHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 18 }, circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }, counterBadge: { backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }, counterText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  guideWrap: { alignItems: 'center', paddingHorizontal: 24, gap: 8 }, guideBox: { width: '82%', aspectRatio: 1.35, borderWidth: 2, borderColor: colors.teal, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.05)' }, regionTitle: { color: colors.white, fontSize: 19, fontWeight: '900', textAlign: 'center' }, regionInstruction: { color: colors.white, opacity: 0.92, fontSize: 11, lineHeight: 17, textAlign: 'center' }, frameText: { color: colors.teal, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  cameraFooter: { alignItems: 'center', gap: 17, padding: 24, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.4)' }, cameraHelp: { color: colors.white, fontSize: 11, lineHeight: 17, textAlign: 'center' }, shutter: { width: 82, height: 82, borderRadius: 41, borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white },
  reviewCard: { alignItems: 'center', gap: 10, paddingVertical: 28 }, reviewTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' }, reviewText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  securing: { paddingVertical: 80, gap: 16 }, secureTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'center' }, percent: { color: colors.teal, fontSize: 34, fontWeight: '900', textAlign: 'center' }, secureText: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
