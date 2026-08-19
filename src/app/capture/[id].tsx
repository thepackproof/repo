import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { AppIcon } from '@/components/app-icon';
import NetInfo from '@react-native-community/netinfo';
import { ProgressBar } from '@/components/ui';
import { SealGuideOverlay, TaskArt } from '@/components/task-art';
import { TaskSession } from '@/components/task-session';
import { colors } from '@/constants/brand';
import { prepareCaptureAttestation, prepareEvidenceSessionAttestation } from '@/lib/api';
import { startCaptureTelemetry } from '@/lib/capture-telemetry';
import {
  canDiscardReviewedCapture,
  canTransitionCaptureStage,
  captureForegroundInterruption,
  shouldDeleteLocalCaptureOnUnmount,
  type CaptureStage,
} from '@/lib/capture-workflow';
import {
  captureGuideFor,
  captureTitles,
  consumerCameraPrompt,
  labelAwareTypes,
  requestedRegions,
  videoTypes,
} from '@/lib/capture-guides';
import { enqueueEvidence, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { captureShippingLabelStill, hashShippingLabelObservation } from '@/lib/shipping-label-scan';
import { identifyTrackingNumber } from '@/lib/shipping-tracker';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import { hrefAfterCapture, toHref } from '@/lib/ux-flow';
import type { EvidenceType } from '@/types/models';
import type { CaptureAttestation, CaptureManifestInput, ShippingLabelTelemetry } from '@/types/telemetry';

const zoomSteps = [0, 0.15, 0.3] as const;
const MAX_VIDEO_DURATION_SECONDS = 15 * 60;
const BARCODE_FLASH_MS = 1400;
const LABEL_SCAN_SETTLE_MS = 12_000;

function giveCaptureHaptic(kind: 'press' | 'recording' | 'barcode' | 'barcodeUnknown'): void {
  const task = kind === 'barcode'
    ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : kind === 'barcodeUnknown'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      : kind === 'recording'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  void task.catch(() => undefined);
}

type ReviewSummary = { durationMs: number; sizeBytes: number | null; widthPixels: number | null; heightPixels: number | null };

function offlineAttestation(reasonCode: 'NO_NETWORK' | 'ATTESTATION_PROVIDER_UNAVAILABLE'): CaptureAttestation {
  const now = new Date().toISOString();
  return {
    mode: 'OFFLINE_UNATTESTED',
    captureSessionId: null,
    nonce: Crypto.randomUUID(),
    appId: null,
    issuedAt: now,
    captureWindowEndsAt: null,
    tokenReplayDetected: null,
    reasonCodes: [reasonCode],
    deviceKeyProof: null,
  };
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{
    id: string;
    type: EvidenceType;
    session?: string;
    returnPassportId?: string;
    connectSessionId?: string;
    evidenceSessionId?: string;
    evidenceSessionToken?: string;
    evidenceSessionOperationKey?: string;
  }>();
  const { id, returnPassportId, connectSessionId, evidenceSessionId, evidenceSessionToken, evidenceSessionOperationKey } = params;
  const session = typeof params.session === 'string' ? params.session : undefined;
  const skipPrep = session === 'pack' || session === 'task';
  const rawType = params.type;
  const type = rawType && captureTitles[rawType] ? rawType : 'CONDITION_PHOTO';
  const isVideo = videoTypes.has(type);
  const guide = captureGuideFor(type, isVideo);
  const router = useRouter();
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [stage, setStage] = useState<CaptureStage>(skipPrep ? 'CAMERA' : 'CHECKLIST');
  const goTo = (next: CaptureStage) => {
    setStage((current) => (canTransitionCaptureStage(current, next) ? next : current));
  };
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [previewSeconds, setPreviewSeconds] = useState(0);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState<number>(zoomSteps[0]);
  const [includeLocation] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [manifest, setManifest] = useState<CaptureManifestInput | null>(null);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [progress, setProgress] = useState(0);
  const [shippingLabel, setShippingLabel] = useState<ShippingLabelTelemetry | null>(null);
  const [barcodeFlash, setBarcodeFlash] = useState(false);
  const [labelStillUri, setLabelStillUri] = useState<string | null>(null);
  const shutterScale = useMemo(() => new Animated.Value(1), []);
  const shippingLabelRef = useRef<ShippingLabelTelemetry | null>(null);
  const labelStillUriRef = useRef<string | null>(null);
  const labelScanPromiseRef = useRef<Promise<void> | null>(null);
  const captureAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const captureInFlightRef = useRef(false);
  const recordingRef = useRef(false);
  const collectorRef = useRef<Awaited<ReturnType<typeof startCaptureTelemetry>> | null>(null);
  const interruptionRef = useRef<string | null>(null);
  const localUriRef = useRef<string | null>(null);
  const securingRef = useRef(false);
  const stopRecordingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || !captureInFlightRef.current) return;
      const interruption = captureForegroundInterruption(recordingRef.current);
      interruptionRef.current = interruption.message;
      if (interruption.stopRecording) stopRecordingRef.current?.();
    });
    return () => {
      mountedRef.current = false;
      captureInFlightRef.current = false;
      subscription.remove();
      if (recordingRef.current) {
        interruptionRef.current = 'Recording stopped because the camera screen closed.';
        stopRecordingRef.current?.();
      }
      stopRecordingRef.current = null;
      const collector = collectorRef.current;
      collectorRef.current = null;
      if (collector) void collector.finish().catch(() => undefined);
      const temporaryUri = localUriRef.current;
      if (temporaryUri && shouldDeleteLocalCaptureOnUnmount(securingRef.current, true)) {
        localUriRef.current = null;
        void FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
      }
      const stillUri = labelStillUriRef.current;
      if (stillUri) {
        labelStillUriRef.current = null;
        void FileSystem.deleteAsync(stillUri, { idempotent: true }).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRecordingSeconds(Math.min(MAX_VIDEO_DURATION_SECONDS, Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (stage !== 'CAMERA' || recording) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setPreviewSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [recording, stage]);

  useEffect(() => {
    if (!barcodeFlash) return;
    const timer = setTimeout(() => setBarcodeFlash(false), BARCODE_FLASH_MS);
    return () => clearTimeout(timer);
  }, [barcodeFlash]);

  const pulseShutter = () => {
    shutterScale.setValue(0.86);
    Animated.spring(shutterScale, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }).start();
    giveCaptureHaptic('press');
  };

  const deleteLabelStill = async () => {
    const stillUri = labelStillUriRef.current;
    labelStillUriRef.current = null;
    if (mountedRef.current) setLabelStillUri(null);
    if (stillUri) await FileSystem.deleteAsync(stillUri, { idempotent: true }).catch(() => undefined);
  };

  const settleShippingLabelObservation = async (): Promise<ShippingLabelTelemetry | null> => {
    const pending = labelScanPromiseRef.current;
    if (pending) {
      await Promise.race([
        pending.then(() => undefined, () => undefined),
        new Promise<void>((resolve) => { setTimeout(resolve, LABEL_SCAN_SETTLE_MS); }),
      ]);
    }
    return shippingLabelRef.current;
  };

  const handleBarcodeScanned = ({ data, type: symbology }: { data: string; type: string }) => {
    if (!labelAwareTypes.has(type)) return;
    if (!data || data.length > 512) return;
    const trackingNumber = data.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 120);
    if (trackingNumber.length < 8) return;
    if (shippingLabelRef.current?.trackingNumber === trackingNumber) return;
    const previousStill = labelStillUriRef.current;
    labelStillUriRef.current = null;
    if (mountedRef.current) setLabelStillUri(null);
    if (previousStill) void FileSystem.deleteAsync(previousStill, { idempotent: true }).catch(() => undefined);
    const next: ShippingLabelTelemetry = {
      rawDecodedValue: data,
      trackingNumber,
      normalizationProfile: 'PACKPROOF_TRACKING_ALNUM_V1',
      symbology: String(symbology).slice(0, 80),
      detectedAt: new Date().toISOString(),
      source: 'CAMERA_BARCODE_SCANNER',
    };
    shippingLabelRef.current = next;
    setShippingLabel(next);
    setBarcodeFlash(true);
    const identity = identifyTrackingNumber(data, trackingNumber);
    giveCaptureHaptic(identity.identified ? 'barcode' : 'barcodeUnknown');
    const work = (async () => {
      const captured = await captureShippingLabelStill({
        camera: camera.current,
        recording: recordingRef.current,
        skipStill: !isVideo,
      });
      if (captured.localUri) {
        labelStillUriRef.current = captured.localUri;
        if (mountedRef.current) setLabelStillUri(captured.localUri);
      }
      const hashed = await hashShippingLabelObservation(next, captured.still);
      shippingLabelRef.current = hashed;
      if (mountedRef.current) setShippingLabel(hashed);
    })();
    labelScanPromiseRef.current = work;
    void work.catch(() => undefined);
  };

  const cycleFlash = () => {
    if (isVideo) {
      setTorchEnabled((enabled) => !enabled);
      return;
    }
    setFlashMode((current) => current === 'off' ? 'auto' : current === 'auto' ? 'on' : 'off');
  };

  const observedFlashMode: CaptureManifestInput['cameraObservation']['flashMode'] = isVideo
    ? (torchEnabled ? 'TORCH' : 'OFF')
    : flashMode.toUpperCase() as CaptureManifestInput['cameraObservation']['flashMode'];

  const requestPermissions = async () => {
    const cameraResult = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const micResult = !isVideo || microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
    if (!cameraResult?.granted || (isVideo && !micResult?.granted)) {
      const blocked = cameraResult?.canAskAgain === false || (isVideo && micResult?.canAskAgain === false);
      Alert.alert(
        'Camera access is needed',
        isVideo
          ? 'PackProof needs camera and microphone access to record packing. Enable Camera for PackProof in Settings.'
          : 'PackProof needs camera access to photograph the package. Enable Camera for PackProof in Settings.',
        blocked
          ? [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } }]
          : [{ text: 'Continue' }],
      );
      return;
    }
    setCameraReady(false);
    setCameraError(null);
    goTo('CAMERA');
  };

  const capture = async () => {
    if (!camera.current || !cameraReady || cameraError || preparing) return;
    setPreparing(true);
    let collector: Awaited<ReturnType<typeof startCaptureTelemetry>> | null = null;
    let capturedUri: string | null = null;
    try {
      captureInFlightRef.current = true;
      interruptionRef.current = null;
      setReviewSummary(null);
      captureAttemptRef.current += 1;
      const captureId = Crypto.randomUUID();
      collector = await startCaptureTelemetry(includeLocation);
      collectorRef.current = collector;
      let attestation: CaptureAttestation;
      try {
        attestation = evidenceSessionId && evidenceSessionToken && evidenceSessionOperationKey
          ? await prepareEvidenceSessionAttestation({
            evidenceSessionId,
            token: evidenceSessionToken,
            operationKey: evidenceSessionOperationKey,
            runtimeIntegrity: collector.runtimeIntegrity,
          })
          : await prepareCaptureAttestation({
            transactionId: id,
            returnPassportId: returnPassportId ?? null,
            connectSessionId: connectSessionId ?? null,
            runtimeIntegrity: collector.runtimeIntegrity,
          });
      } catch (error) {
        if (evidenceSessionId) throw error;
        const network = await NetInfo.fetch();
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (network.isConnected === false || network.isInternetReachable === false) {
          attestation = offlineAttestation('NO_NETWORK');
        } else if (code.includes('unavailable') || code.includes('deadline-exceeded') || message.includes('device attestation') || message.includes('app check')) {
          attestation = offlineAttestation('ATTESTATION_PROVIDER_UNAVAILABLE');
        } else throw error;
      }

      if (!mountedRef.current) {
        captureInFlightRef.current = false;
        collector = null;
        return;
      }
      if (interruptionRef.current) throw new Error(interruptionRef.current);
      const activeCamera = camera.current;
      if (!activeCamera) throw new Error('The native camera became unavailable before capture started.');

      const captureStartedAt = collector.markCaptureStarted();
      let result: { uri?: string; width?: number; height?: number } | null | undefined = null;
      if (isVideo) {
        recordingRef.current = true;
        stopRecordingRef.current = () => activeCamera.stopRecording();
        setRecordingSeconds(0);
        setRecording(true);
        setPreparing(false);
        giveCaptureHaptic('recording');
        result = await activeCamera.recordAsync({ maxDuration: MAX_VIDEO_DURATION_SECONDS });
        recordingRef.current = false;
        stopRecordingRef.current = null;
        setRecording(false);
      } else {
        result = await activeCamera.takePictureAsync({ quality: 0.92, exif: false, shutterSound: true });
        setPreparing(false);
      }
      capturedUri = result?.uri ?? null;
      if (!capturedUri) throw new Error('The camera returned no capture file.');
      if (interruptionRef.current) throw new Error(interruptionRef.current);
      const settledLabel = await settleShippingLabelObservation();
      if (!mountedRef.current) {
        await FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => undefined);
        capturedUri = null;
        captureInFlightRef.current = false;
        collector = null;
        return;
      }
      const fileInfo = await FileSystem.getInfoAsync(capturedUri);
      collectorRef.current = null;
      const telemetry = await collector.finish();
      collector = null;
      if (!mountedRef.current) {
        await FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => undefined);
        capturedUri = null;
        captureInFlightRef.current = false;
        return;
      }
      if (result?.uri) {
        const nextManifest: CaptureManifestInput = {
          schemaVersion: 2,
          captureId,
          captureStartedAt,
          captureFinishedAt: telemetry.finishedAt,
          time: {
            deviceWallStartedAt: captureStartedAt,
            deviceWallFinishedAt: telemetry.finishedAt,
            monotonicElapsedMs: telemetry.monotonicElapsedMs,
            deviceWallProvenance: 'CLIENT_OBSERVED_UNTRUSTED',
            monotonicProvenance: 'CLIENT_OBSERVED_RELATIVE_ONLY',
            serverTimeProvenance: 'ADDED_AT_RECEIPT_AND_FINALIZATION',
          },
          captureProfile: {
            profileId: 'packproof-digital-evidence',
            profileVersion: '2.0.0',
            profileScope: 'HUMAN_GUIDED_DIGITAL_EVIDENCE',
            requestedRegions: requestedRegions[type],
            observedRegions: [],
            regionObservationMethod: 'USER_GUIDED_NOT_MACHINE_CONFIRMED',
            attempt: captureAttemptRef.current,
          },
          cameraObservation: {
            source: 'EXPO_CAMERA_ORIGINAL_OUTPUT',
            facing: 'BACK',
            mode: isVideo ? 'VIDEO' : 'PHOTO',
            widthPixels: result.width ?? null,
            heightPixels: result.height ?? null,
            orientation: null,
            flashMode: observedFlashMode,
            zoom,
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
          runtimeIntegrity: telemetry.runtimeIntegrity,
          sensorFusion: telemetry.sensorFusion,
          networkTelemetry: telemetry.networkTelemetry,
          geolocation: telemetry.geolocation,
          shippingLabel: settledLabel,
          attestation,
        };
        localUriRef.current = result.uri;
        setLocalUri(result.uri);
        setManifest(nextManifest);
        setReviewSummary({
          durationMs: telemetry.monotonicElapsedMs,
          sizeBytes: fileInfo.exists && typeof fileInfo.size === 'number' ? fileInfo.size : null,
          widthPixels: result.width ?? null,
          heightPixels: result.height ?? null,
        });
        captureInFlightRef.current = false;
        goTo('REVIEW');
      }
    } catch (error) {
      captureInFlightRef.current = false;
      recordingRef.current = false;
      stopRecordingRef.current = null;
      if (mountedRef.current) {
        setRecording(false);
        setPreparing(false);
      }
      if (collector && collectorRef.current === collector) {
        collectorRef.current = null;
        await collector.finish().catch(() => undefined);
      }
      if (capturedUri) await FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => undefined);
      if (mountedRef.current) Alert.alert('Capture failed', readableError(error));
    }
  };

  const stop = () => stopRecordingRef.current?.();

  const discard = async () => {
    if (!canDiscardReviewedCapture(stage, securingRef.current)) return;
    const temporaryUri = localUriRef.current ?? localUri;
    localUriRef.current = null;
    if (temporaryUri) await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    setLocalUri(null);
    setManifest(null);
    setReviewSummary(null);
    shippingLabelRef.current = null;
    setShippingLabel(null);
    setBarcodeFlash(false);
    await deleteLabelStill();
    setCameraReady(false);
    setCameraError(null);
    goTo('CAMERA');
  };

  const close = async () => {
    const temporaryUri = localUriRef.current;
    localUriRef.current = null;
    if (temporaryUri) await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    await deleteLabelStill();
    if (connectSessionId || evidenceSessionId) {
      router.back();
      return;
    }
    if (session === 'pack') {
      const beat = type === 'PACKING_VIDEO' || type === 'RETURN_PACKING_VIDEO' ? 'prep' : 'label';
      router.replace(toHref({ pathname: '/pack/[id]', params: { id, beat } }));
      return;
    }
    router.replace(toHref({ pathname: '/task/[id]', params: { id } }));
  };

  const upload = async () => {
    if (!localUri || !id || !user) return;
    const observedLabel = shippingLabelRef.current ?? shippingLabel;
    const trackingNumber = observedLabel?.trackingNumber ?? null;
    const courierCode = observedLabel
      ? identifyTrackingNumber(observedLabel.rawDecodedValue, observedLabel.trackingNumber).courierCode
      : null;
    securingRef.current = true;
    goTo('UPLOADING');
    setProgress(0);
    let queuedId: string | null = null;
    try {
      const extension = isVideo ? 'mp4' : 'jpg';
      const item = await enqueueEvidence({
        transactionId: id,
        uploaderId: user.uid,
        evidenceType: type,
        localUri,
        contentType: isVideo ? 'video/mp4' : 'image/jpeg',
        originalName: `${type.toLowerCase()}-${Date.now()}.${extension}`,
        manifest,
        captureSessionId: manifest?.attestation.captureSessionId ?? null,
        returnPassportId: returnPassportId ?? null,
        connectSessionId: connectSessionId ?? null,
      });
      queuedId = item.id;
      localUriRef.current = null;
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
      await deleteLabelStill();
      if (mountedRef.current) {
        setLocalUri(null);
        setManifest(null);
        setReviewSummary(null);
      }
      securingRef.current = false;
      const result = await syncEvidenceQueue({ targetId: item.id, onProgress: (value) => { if (mountedRef.current) setProgress(value); } });
      if (!mountedRef.current) return;
      if (connectSessionId || evidenceSessionId) {
        router.back();
        return;
      }
      router.replace(toHref(hrefAfterCapture({
        transactionId: id,
        type,
        session,
        trackingNumber,
        courierCode,
      })));
      void result;
    } catch (error) {
      securingRef.current = false;
      if (queuedId) {
        if (mountedRef.current) {
          setProgress(1);
          if (connectSessionId || evidenceSessionId) {
            Alert.alert(
              'Saved on this phone',
              `You can leave this screen; PackProof will retry. ${readableError(error)}`,
              [{ text: 'Done', onPress: () => router.back() }],
            );
          } else {
            router.replace(toHref({ pathname: '/task/[id]', params: { id } }));
          }
        }
      } else {
        if (!mountedRef.current) {
          localUriRef.current = null;
          await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
        } else {
          goTo('REVIEW');
          Alert.alert('Could not save that', readableError(error));
        }
      }
    }
  };

  const shutterDisabled = !recording && !preparing && (!cameraReady || Boolean(cameraError));
  const coaching = consumerCameraPrompt(type, {
    recordingSeconds,
    previewSeconds,
    barcodeCaptured: Boolean(shippingLabel),
    preparing,
  });
  const showSealGuide = type === 'SHIPPING_LABEL' || type === 'RETURN_SHIPPING_LABEL';

  if (stage === 'CAMERA') return <View style={styles.cameraPage}>
    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode={isVideo ? 'video' : 'picture'} flash={isVideo ? 'off' : flashMode} enableTorch={isVideo && torchEnabled} zoom={zoom} videoQuality="720p" mute={false} onCameraReady={() => { setCameraReady(true); setCameraError(null); }} onMountError={({ message }) => { setCameraReady(false); setCameraError(message); }} onBarcodeScanned={labelAwareTypes.has(type) ? handleBarcodeScanned : undefined} barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'qr', 'pdf417', 'aztec', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'datamatrix'] }} />
    <SafeAreaView style={styles.overlay}>
      <View style={styles.cameraHeader}>
        <Pressable disabled={recording || preparing} onPress={() => { void close(); }} style={styles.circleButton} accessibilityLabel="Close">
          <AppIcon name="xmark" size={18} tintColor={colors.white} />
        </Pressable>
        {recording ? <View style={styles.recDot} /> : <View style={styles.recDotSpacer} />}
      </View>
      <View pointerEvents="none" style={styles.guideArea}>
        {isVideo ? null : showSealGuide ? <SealGuideOverlay /> : <View style={[styles.frameGuide, { aspectRatio: guide.aspectRatio }]} />}
      </View>
      <View style={styles.cameraFooter}>
        <Text style={styles.coaching}>{cameraError ? 'Camera could not start.' : coaching}</Text>
        <View style={styles.shutterRow}>
          <Pressable
            accessibilityLabel={isVideo ? `${torchEnabled ? 'Turn off' : 'Turn on'} light` : 'Flash'}
            disabled={!cameraReady || recording || preparing}
            onPress={cycleFlash}
            style={[styles.flashButton, (!cameraReady || recording || preparing) && styles.controlDisabled]}
          >
            <AppIcon name="camera.fill" size={18} tintColor={colors.white} />
          </Pressable>
          <Pressable
            accessibilityLabel={recording ? 'Stop recording' : 'Start capture'}
            disabled={shutterDisabled}
            onPressIn={shutterDisabled ? undefined : pulseShutter}
            onPress={recording ? stop : capture}
            style={[styles.shutter, preparing && styles.shutterPreparing, recording && styles.shutterRecording, shutterDisabled && { opacity: 0.55 }]}
          >
            <Animated.View style={[styles.shutterInner, preparing && styles.shutterInnerPreparing, recording && styles.stopInner, { transform: [{ scale: shutterScale }] }]} />
          </Pressable>
          <View style={styles.flashButton} />
        </View>
      </View>
    </SafeAreaView>
    {recording ? <View pointerEvents="none" style={styles.recordingFrame} /> : null}
  </View>;

  if (stage === 'REVIEW') {
    return (
      <TaskSession
        art={!isVideo && localUri
          ? <Image source={{ uri: localUri }} contentFit="contain" style={styles.reviewImage} accessibilityLabel="Captured preview" />
          : <TaskArt kind="check" />}
        title="Looks good?"
        sentence="You can retake it if not."
        onClose={() => { void close(); }}
        primary={{ label: 'Looks good', onPress: () => { void upload(); } }}
        secondary={{ label: 'Retake', onPress: () => { void discard(); } }}
      />
    );
  }

  if (stage === 'UPLOADING') {
    return (
      <TaskSession
        art={<TaskArt kind="check" />}
        title="Saving"
        sentence="You can leave. PackProof will keep going."
        onClose={() => { void close(); }}
      >
        <ProgressBar value={progress} />
      </TaskSession>
    );
  }

  return (
    <TaskSession
      art={<TaskArt kind={isVideo ? 'phone' : type === 'DELIVERY_PHOTO' ? 'box' : 'label'} />}
      title={isVideo ? (type.includes('UNBOXING') ? 'Record the unboxing' : 'Set your phone down') : type === 'DELIVERY_PHOTO' ? 'Photograph the arrived box' : 'Photograph the box'}
      sentence={isVideo ? (type.includes('UNBOXING') ? 'Start with the sealed package.' : 'Keep the item and box in view.') : 'Keep the whole label in the frame.'}
      onClose={() => { void close(); }}
      primary={{ label: isVideo ? 'I’m ready' : 'Take photo', onPress: () => { void requestPermissions(); } }}
    />
  );
}

const styles = StyleSheet.create({
  cameraPage: { flex: 1, backgroundColor: colors.black },
  overlay: { flex: 1, justifyContent: 'space-between' },
  cameraHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger },
  recDotSpacer: { width: 12, height: 12 },
  recordingFrame: { ...StyleSheet.absoluteFill, borderWidth: 6, borderColor: colors.danger, zIndex: 20 },
  guideArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  frameGuide: { width: '88%', maxHeight: '70%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.03)' },
  cameraFooter: { alignItems: 'center', gap: 16, padding: 24, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.38)' },
  coaching: { color: colors.white, fontSize: 20, lineHeight: 26, fontWeight: '700', textAlign: 'center', textShadowColor: colors.black, textShadowRadius: 6 },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 },
  flashButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  controlDisabled: { opacity: 0.45 },
  shutter: { width: 82, height: 82, borderRadius: 41, borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white },
  shutterPreparing: { borderColor: colors.amber },
  shutterInnerPreparing: { backgroundColor: colors.amber },
  shutterRecording: { borderColor: colors.danger },
  stopInner: { width: 31, height: 31, borderRadius: 7, backgroundColor: colors.danger },
  reviewImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, backgroundColor: colors.black },
});
