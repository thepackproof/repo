import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { AppIcon } from '@/components/app-icon';
import NetInfo from '@react-native-community/netinfo';
import { Button, Card, ProgressBar, ScreenTitle } from '@/components/ui';
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
  captureChecklists,
  captureGuideFor,
  captureTitles,
  formatCaptureBytes,
  formatCaptureDuration,
  labelAwareTypes,
  requestedRegions,
  videoTypes,
} from '@/lib/capture-guides';
import { enqueueEvidence, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { captureShippingLabelStill, hashShippingLabelObservation } from '@/lib/shipping-label-scan';
import { identifyTrackingNumber } from '@/lib/shipping-tracker';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
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
    returnPassportId?: string;
    connectSessionId?: string;
    evidenceSessionId?: string;
    evidenceSessionToken?: string;
    evidenceSessionOperationKey?: string;
  }>();
  const { id, returnPassportId, connectSessionId, evidenceSessionId, evidenceSessionToken, evidenceSessionOperationKey } = params;
  const rawType = params.type;
  const type = rawType && captureTitles[rawType] ? rawType : 'CONDITION_PHOTO';
  const isVideo = videoTypes.has(type);
  const guide = captureGuideFor(type, isVideo);
  const router = useRouter();
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [stage, setStage] = useState<CaptureStage>('CHECKLIST');
  const goTo = (next: CaptureStage) => {
    setStage((current) => (canTransitionCaptureStage(current, next) ? next : current));
  };
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState<number>(zoomSteps[0]);
  const [includeLocation, setIncludeLocation] = useState(false);
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

  const cycleZoom = () => {
    setZoom((current) => zoomSteps[(zoomSteps.indexOf(current as typeof zoomSteps[number]) + 1) % zoomSteps.length]);
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
        'Permission required',
        isVideo ? 'Camera and microphone access are required to record evidence video.' : 'Camera access is required to photograph transaction evidence.',
        blocked
          ? [{ text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => { void Linking.openSettings(); } }]
          : [{ text: 'OK' }],
      );
      return;
    }
    setCameraReady(false);
    setCameraError(null);
    goTo('CAMERA');
  };

  const changeLocationPreference = async (enabled: boolean) => {
    if (!enabled) { setIncludeLocation(false); return; }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setIncludeLocation(false);
      Alert.alert('Location not included', 'PackProof will continue without location. You can enable location permission later in Android Settings.');
      return;
    }
    setIncludeLocation(true);
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
    router.back();
  };

  const upload = async () => {
    if (!localUri || !id || !user) return;
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
      const uploaded = result.uploadedIds.includes(item.id);
      const terminal = result.terminalIds.includes(item.id);
      if (mountedRef.current) {
        Alert.alert(
          uploaded ? 'Evidence finalized' : terminal ? 'Evidence retained — attention required' : 'Evidence secured in queue',
          uploaded
            ? 'The encrypted queue transferred the original file, and the server completed independent hashing plus a service-authenticated manifest.'
            : terminal
              ? 'The encrypted original was retained, but automatic retry stopped because the queue encountered a non-retryable condition. Do not clear app data or uninstall; review the Capture queue before relying on this evidence.'
              : 'The original capture is encrypted in PackProof’s private queue and will retry automatically when server access and connectivity are available.',
          [{ text: 'Done', onPress: () => router.replace(`/transaction/${id}`) }],
        );
      }
    } catch (error) {
      securingRef.current = false;
      if (queuedId) {
        if (mountedRef.current) {
          setProgress(1);
          Alert.alert(
            'Evidence secured in queue',
            `The original was encrypted locally before synchronization encountered a problem. Automatic retry remains enabled; do not clear app data or uninstall. ${readableError(error)}`,
            [{ text: 'Done', onPress: () => router.replace(`/transaction/${id}`) }],
          );
        }
      } else {
        if (!mountedRef.current) {
          localUriRef.current = null;
          await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
        } else {
          goTo('REVIEW');
          Alert.alert('Could not secure evidence', readableError(error));
        }
      }
    }
  };

  const shutterDisabled = !recording && !preparing && (!cameraReady || Boolean(cameraError));
  const cameraHelp = cameraError
    ? `The camera preview could not start: ${cameraError}`
    : !cameraReady
      ? 'Waiting for the native camera preview before capture is enabled.'
      : preparing
        ? 'Button pressed. Refreshing online app-integrity context, then recording will start.'
        : recording
          ? (type === 'PACKING_VIDEO' || type === 'RETURN_PACKING_VIDEO'
            ? 'Recording. Keep the item-to-seal sequence in frame. Hold steady on the marked boundary for the final seconds.'
            : 'Recording. Keep every relevant item and the package in frame. Hold steady for the final three seconds.')
          : isVideo
            ? (labelAwareTypes.has(type)
              ? 'Aim the viewfinder at the tracking barcode. A still and tracker check run when it is identified; scanning remains optional.'
              : 'Tap the shutter to begin a continuous recording.')
            : type === 'SHIPPING_LABEL' || type === 'RETURN_SHIPPING_LABEL' || type === 'DELIVERY_PHOTO'
              ? 'Hold steady on the marked boundary, tape or seal, and nearby cardboard.'
              : 'Frame the evidence clearly, then capture.';
  const tracker = shippingLabel?.tracker;
  const liveIdentity = useMemo(
    () => (shippingLabel ? identifyTrackingNumber(shippingLabel.rawDecodedValue, shippingLabel.trackingNumber) : null),
    [shippingLabel],
  );
  const barcodeIdentified = tracker?.identified ?? liveIdentity?.identified ?? false;
  const courierCode = (tracker?.courierCode ?? liveIdentity?.courierCode ?? 'CARRIER').toUpperCase();
  const barcodeBadgeLabel = !shippingLabel
    ? 'OPTIONAL · AIM AT THE TRACKING BARCODE'
    : barcodeFlash && barcodeIdentified
      ? `${courierCode} · IDENTIFIED`
      : barcodeFlash
        ? 'BARCODE READ · CARRIER UNKNOWN'
        : tracker?.sha256
          ? `${courierCode} · HASHED · ${shippingLabel.trackingNumber}`
          : `VALIDATING · ${shippingLabel.trackingNumber}`;

  if (stage === 'CAMERA') return <View style={styles.cameraPage}>
    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode={isVideo ? 'video' : 'picture'} flash={isVideo ? 'off' : flashMode} enableTorch={isVideo && torchEnabled} zoom={zoom} videoQuality="720p" mute={false} onCameraReady={() => { setCameraReady(true); setCameraError(null); }} onMountError={({ message }) => { setCameraReady(false); setCameraError(message); }} onBarcodeScanned={labelAwareTypes.has(type) ? handleBarcodeScanned : undefined} barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'qr', 'pdf417', 'aztec', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'datamatrix'] }} />
    <SafeAreaView style={styles.overlay}>
      <View style={styles.cameraHeader}>
        <Pressable disabled={recording || preparing} onPress={() => { void close(); }} style={styles.circleButton}><AppIcon name="xmark" size={18} tintColor={colors.white} /></Pressable>
        <View style={[styles.captureLabel, preparing && styles.captureLabelPreparing, recording && styles.captureLabelRecording, cameraError && styles.captureLabelError]}>
          <View style={[styles.liveDot, (preparing || recording || cameraError) && styles.liveDotOnColor]} />
          <Text style={styles.captureLabelText}>{cameraError ? 'CAMERA UNAVAILABLE' : preparing ? 'STARTING…' : recording ? `REC ${formatCaptureDuration(recordingSeconds)} · CONTINUOUS` : cameraReady ? captureTitles[type].toUpperCase() : 'STARTING CAMERA…'}</Text>
        </View>
      </View>
      {isVideo ? <View pointerEvents="none" style={styles.guideArea} /> : (
        <View pointerEvents="none" style={styles.guideArea}>
          <View style={[styles.frameGuide, { aspectRatio: guide.aspectRatio }]} />
          <Text style={styles.guideTitle}>{guide.title}</Text>
          <Text style={styles.guideInstruction}>{guide.instruction}</Text>
          <Text style={styles.guideDisclaimer}>GUIDE ONLY · COVERAGE IS NOT MACHINE-CONFIRMED</Text>
        </View>
      )}
      <View style={styles.cameraFooter}>
        <View style={styles.cameraControls}>
          <Pressable accessibilityLabel={isVideo ? `${torchEnabled ? 'Disable' : 'Enable'} camera light` : `Change flash mode, currently ${flashMode}`} disabled={recording || preparing || !cameraReady} onPress={cycleFlash} style={[styles.controlPill, (recording || preparing || !cameraReady) && styles.controlDisabled]}><Text style={styles.controlText}>{isVideo ? `LIGHT ${torchEnabled ? 'ON' : 'OFF'}` : `FLASH ${flashMode.toUpperCase()}`}</Text></Pressable>
          <Pressable accessibilityLabel={`Change camera zoom, currently ${Math.round(zoom * 100)} percent of device maximum`} disabled={recording || preparing || !cameraReady} onPress={cycleZoom} style={[styles.controlPill, (recording || preparing || !cameraReady) && styles.controlDisabled]}><Text style={styles.controlText}>ZOOM {Math.round(zoom * 100)}%</Text></Pressable>
        </View>
        {labelAwareTypes.has(type) ? (
          <View style={styles.barcodeRow}>
            {labelStillUri ? <Image source={{ uri: labelStillUri }} contentFit="cover" style={styles.labelStillThumb} accessibilityLabel="Captured shipping-label still" /> : null}
            <View style={[
              styles.barcodeBadge,
              shippingLabel && barcodeIdentified && styles.barcodeBadgeRead,
              shippingLabel && !barcodeIdentified && styles.barcodeBadgeUnknown,
              barcodeFlash && barcodeIdentified && styles.barcodeBadgeFlash,
              barcodeFlash && !barcodeIdentified && styles.barcodeBadgeUnknownFlash,
            ]}>
              <AppIcon name={shippingLabel ? 'checkmark.circle.fill' : 'barcode.viewfinder'} size={16} tintColor={colors.white} />
              <Text style={styles.barcodeText}>{barcodeBadgeLabel}</Text>
            </View>
          </View>
        ) : null}
        <Text style={styles.cameraHelp}>{cameraHelp}</Text>
        <Pressable
          accessibilityLabel={recording ? 'Stop recording' : 'Start capture'}
          disabled={shutterDisabled}
          onPressIn={shutterDisabled ? undefined : pulseShutter}
          onPress={recording ? stop : capture}
          style={[styles.shutter, preparing && styles.shutterPreparing, recording && styles.shutterRecording, shutterDisabled && { opacity: 0.55 }]}
        >
          <Animated.View style={[styles.shutterInner, preparing && styles.shutterInnerPreparing, recording && styles.stopInner, { transform: [{ scale: shutterScale }] }]} />
        </Pressable>
      </View>
    </SafeAreaView>
    {isVideo && preparing ? <View pointerEvents="none" style={styles.preparingFrame} /> : null}
    {recording ? <View pointerEvents="none" style={styles.recordingFrame} /> : null}
  </View>;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Button label="Close" variant="ghost" onPress={() => { void close(); }} style={styles.close} disabled={stage === 'UPLOADING'} />
    {stage === 'CHECKLIST' ? <>
      <ScreenTitle eyebrow="Before you begin" title={captureTitles[type]} subtitle={isVideo ? 'This must be one continuous, unedited recording. Prepare the package and supplies before you start.' : 'Capture an original image directly in PackProof so it stays connected to this transaction.'} />
      <Card style={styles.checklist}>{(captureChecklists[type] ?? captureChecklists.CONDITION_PHOTO!).map((item, index) => <View key={item} style={styles.check}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><Text style={styles.checkText}>{item}</Text></View>)}</Card>
      {['PACKING_VIDEO', 'SHIPPING_LABEL', 'UNBOXING_VIDEO', 'DELIVERY_PHOTO', 'RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL', 'RETURN_UNBOXING_VIDEO'].includes(type) ? <Card style={styles.caution}><AppIcon name="info.circle.fill" size={20} tintColor={colors.amber} /><Text style={styles.cautionText}>Human visual review may note visible continuity or difference. PackProof does not conclude that the package is the same or altered, or identify a cause, actor, authenticity, custody, fraud, or fault.</Text></Card> : null}
      <Card style={styles.locationCard}><View style={{ flex: 1, gap: 4 }}><Text style={styles.locationTitle}>Include precise capture location</Text><Text style={styles.locationText}>Optional. When enabled, coordinates and accuracy are included in the private service-authenticated evidence manifest, but omitted from the presentation dossier. Leave off when location is unnecessary.</Text></View><Switch value={includeLocation} onValueChange={(value) => { changeLocationPreference(value).catch((error) => Alert.alert('Could not update location setting', readableError(error))); }} /></Card>
      <Card style={styles.caution}><AppIcon name="exclamationmark.triangle.fill" size={20} tintColor={colors.amber} /><Text style={styles.cautionText}>Do not capture payment cards, government IDs, private messages, unrelated faces or addresses not required for the shipping record.</Text></Card>
      <Button label="I’m ready to capture" icon="camera.fill" onPress={requestPermissions} />
    </> : null}
    {stage === 'REVIEW' ? <>
      <ScreenTitle eyebrow="Encrypted queue ready" title="Secure this evidence?" subtitle="PackProof will hash and encrypt the original capture before attempting any network transfer. It remains queued if connectivity drops." />
      {!isVideo && localUri ? <Image source={{ uri: localUri }} contentFit="contain" style={styles.reviewImage} accessibilityLabel="Captured evidence preview" /> : null}
      <Card style={styles.review}><AppIcon name={isVideo ? 'video.fill' : 'photo.fill'} size={42} tintColor={colors.teal} /><Text style={styles.reviewTitle}>{captureTitles[type]}</Text>{reviewSummary ? <View style={styles.reviewFacts}><Text style={styles.reviewFact}>{isVideo ? `Duration ${formatCaptureDuration(Math.round(reviewSummary.durationMs / 1000))}` : reviewSummary.widthPixels && reviewSummary.heightPixels ? `${reviewSummary.widthPixels} × ${reviewSummary.heightPixels} px` : 'Dimensions unavailable'}</Text><Text style={styles.reviewFact}>{formatCaptureBytes(reviewSummary.sizeBytes)}</Text><Text style={styles.reviewFact}>{manifest?.cameraObservation.flashMode ?? 'OFF'} · zoom {Math.round((manifest?.cameraObservation.zoom ?? 0) * 100)}%</Text></View> : null}{labelStillUri ? <Image source={{ uri: labelStillUri }} contentFit="contain" style={styles.reviewStill} accessibilityLabel="Shipping-label scan still" /> : null}<Text style={styles.reviewText}>{manifest?.attestation.mode === 'JIT_APP_CHECK' ? 'Fresh online App Check context and any available device-key proof are bound to this capture; neither proves the physical scene.' : 'Captured offline; the manifest records that fresh online attestation and trusted absolute capture time were unavailable.'} Acquisition quality is not machine-evaluated, and physical correspondence is not available in this build.{manifest?.shippingLabel ? ` Tracking barcode: ${manifest.shippingLabel.trackingNumber}.` : ''}{manifest?.shippingLabel?.tracker ? ` Open-source tracker: ${manifest.shippingLabel.tracker.lookupStatus}${manifest.shippingLabel.tracker.courierCode ? ` · ${manifest.shippingLabel.tracker.courierCode}` : ''}; observation hash ${manifest.shippingLabel.tracker.sha256.slice(0, 12)}…. This is checksum and courier identification, not carrier custody.` : ''}{manifest?.shippingLabel?.still?.captureStatus === 'CAPTURED' ? ' A label still was hashed into that observation.' : ''}</Text></Card>
      <Button label="Encrypt, hash and sync" icon="lock.shield.fill" onPress={upload} />
      <Button label="Discard and retake" variant="danger" onPress={discard} />
    </> : null}
    {stage === 'UPLOADING' ? <View style={styles.uploading}><AppIcon name="icloud.and.arrow.up.fill" size={48} tintColor={colors.teal} /><Text style={styles.uploadTitle}>Securing your evidence</Text><Text style={styles.uploadPercent}>{Math.round(progress * 100)}%</Text><ProgressBar value={progress} /><Text style={styles.uploadText}>The original is already being protected locally. You can lose connectivity without losing the capture; synchronization resumes automatically.</Text></View> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, container: { flexGrow: 1, padding: 20, paddingBottom: 44, gap: 15 }, close: { alignSelf: 'flex-start', minHeight: 40 },
  checklist: { gap: 17 }, check: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, number: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(70,124,99,0.1)', alignItems: 'center', justifyContent: 'center' }, numberText: { color: colors.teal, fontSize: 12, fontWeight: '900' }, checkText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 20 },
  locationCard: { flexDirection: 'row', gap: 12, alignItems: 'center' }, locationTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, locationText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  caution: { flexDirection: 'row', gap: 11, backgroundColor: 'rgba(138,91,0,0.06)' }, cautionText: { flex: 1, color: colors.amber, fontSize: 11, lineHeight: 17 },
  cameraPage: { flex: 1, backgroundColor: colors.black }, overlay: { flex: 1, justifyContent: 'space-between' }, cameraHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 }, circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }, captureLabel: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 }, captureLabelPreparing: { backgroundColor: colors.amber }, captureLabelRecording: { backgroundColor: colors.danger }, captureLabelError: { backgroundColor: colors.danger }, liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal }, liveDotOnColor: { backgroundColor: colors.white }, captureLabelText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 }, recordingFrame: { ...StyleSheet.absoluteFill, borderWidth: 6, borderColor: colors.danger, zIndex: 20 }, preparingFrame: { ...StyleSheet.absoluteFill, borderWidth: 6, borderColor: colors.amber, zIndex: 20 }, guideArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 7 }, frameGuide: { width: '88%', maxHeight: '70%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)', borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.03)' }, guideTitle: { color: colors.white, fontSize: 15, fontWeight: '900', textAlign: 'center', textShadowColor: colors.black, textShadowRadius: 4 }, guideInstruction: { color: colors.white, maxWidth: 340, fontSize: 10, lineHeight: 15, textAlign: 'center', textShadowColor: colors.black, textShadowRadius: 4 }, guideDisclaimer: { color: colors.white, opacity: 0.78, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, textAlign: 'center' },
  cameraFooter: { alignItems: 'center', gap: 18, padding: 24, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.38)' }, cameraControls: { flexDirection: 'row', gap: 10 }, controlPill: { minWidth: 100, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 }, controlDisabled: { opacity: 0.45 }, controlText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.6 }, barcodeRow: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }, labelStillThumb: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: colors.teal, backgroundColor: colors.black }, barcodeBadge: { flex: 1, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'transparent' }, barcodeBadgeRead: { backgroundColor: 'rgba(70,124,99,0.92)', borderColor: colors.teal }, barcodeBadgeUnknown: { backgroundColor: 'rgba(138,91,0,0.88)', borderColor: colors.amber }, barcodeBadgeFlash: { backgroundColor: colors.teal, borderColor: colors.white }, barcodeBadgeUnknownFlash: { backgroundColor: colors.amber, borderColor: colors.white }, barcodeText: { flexShrink: 1, color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 }, cameraHelp: { color: colors.white, fontSize: 12, lineHeight: 18, textAlign: 'center' }, shutter: { width: 82, height: 82, borderRadius: 41, borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white }, shutterPreparing: { borderColor: colors.amber }, shutterInnerPreparing: { backgroundColor: colors.amber }, shutterRecording: { borderColor: colors.danger }, stopInner: { width: 31, height: 31, borderRadius: 7, backgroundColor: colors.danger },
  reviewImage: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, backgroundColor: colors.black }, reviewStill: { width: '100%', aspectRatio: 4 / 3, maxHeight: 180, borderRadius: 14, backgroundColor: colors.black }, review: { alignItems: 'center', gap: 9, paddingVertical: 32 }, reviewTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' }, reviewFacts: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 }, reviewFact: { color: colors.tealDark, backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, fontSize: 9, fontWeight: '900' }, reviewText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  uploading: { flex: 1, justifyContent: 'center', gap: 16, paddingVertical: 80 }, uploadTitle: { color: colors.ink, fontSize: 25, fontWeight: '900', textAlign: 'center' }, uploadPercent: { color: colors.teal, fontSize: 36, fontWeight: '900', textAlign: 'center' }, uploadText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
