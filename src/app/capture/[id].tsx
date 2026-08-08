import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
import NetInfo from '@react-native-community/netinfo';
import { Button, Card, ProgressBar, ScreenTitle } from '@/components/ui';
import { colors } from '@/constants/brand';
import { prepareCaptureAttestation } from '@/lib/api';
import { startCaptureTelemetry } from '@/lib/capture-telemetry';
import { enqueueEvidence, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { readableError } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceType } from '@/types/models';
import type { CaptureAttestation, CaptureManifestInput, ShippingLabelTelemetry } from '@/types/telemetry';

const videoTypes = new Set<EvidenceType>(['PACKING_VIDEO', 'UNBOXING_VIDEO', 'RETURN_PACKING_VIDEO', 'RETURN_UNBOXING_VIDEO']);
const labelAwareTypes = new Set<EvidenceType>(['PACKING_VIDEO', 'SHIPPING_LABEL', 'RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL']);
const titles: Record<EvidenceType, string> = {
  ITEM_PHOTO: 'Item photo',
  CONDITION_PHOTO: 'Condition photo',
  IDENTIFIER_PHOTO: 'Identifier photo',
  COA_PHOTO: 'COA photo',
  PACKING_VIDEO: 'Continuous packing video',
  SHIPPING_LABEL: 'Shipping label',
  UNBOXING_VIDEO: 'Continuous unboxing video',
  DELIVERY_PHOTO: 'Delivery photo',
  SUPPORTING_DOCUMENT: 'Supporting document',
  RETURN_CONDITION_PHOTO: 'Return condition photo',
  RETURN_PACKING_VIDEO: 'Continuous return repacking video',
  RETURN_SHIPPING_LABEL: 'Return shipping label',
  RETURN_UNBOXING_VIDEO: 'Continuous returned-item unboxing video',
};

const checklists: Partial<Record<EvidenceType, string[]>> = {
  PACKING_VIDEO: [
    'Begin with the unpacked item and all included accessories visible.',
    'Show identifiers, certification numbers, COA and existing condition marks clearly.',
    'Keep the item and open package in frame while adding every packing layer.',
    'Show the sealed package, PP bridge, label and tracking number before ending the recording.',
  ],
  UNBOXING_VIDEO: [
    'Begin with every side of the sealed package visible before cutting any tape.',
    'Keep the package and contents in frame continuously while opening.',
    'Show all packing materials and every included item before setting anything aside.',
    'Slowly show identifiers and any damage or discrepancy before ending.',
  ],
  RETURN_PACKING_VIDEO: [
    'Begin with the returned item, accessories and original identifiers clearly visible.',
    'Document current condition and any reason-specific issue before packing.',
    'Keep the item in frame while adding every packing layer and sealing the package.',
    'Finish on the return label, tracking number and intact PP bridge.',
  ],
  RETURN_UNBOXING_VIDEO: [
    'Begin with all sides of the sealed return package visible.',
    'Open continuously without moving the package or contents off camera.',
    'Show identifiers immediately to detect substitutions or counterfeit swaps.',
    'Document condition, accessories and packing materials before ending.',
  ],
  ITEM_PHOTO: ['Fill the frame with the complete item.', 'Use even lighting and avoid filters.', 'Capture identifiers separately when they are too small to read.'],
  CONDITION_PHOTO: ['Focus on the exact condition area.', 'Include enough surrounding detail to establish where it is.', 'Do not use beauty filters or image editing.'],
  RETURN_CONDITION_PHOTO: ['Show the complete returned item first.', 'Capture the exact condition issue and surrounding context.', 'Include identifiers when possible.'],
};

function offlineAttestation(): CaptureAttestation {
  const now = new Date().toISOString();
  return {
    mode: 'OFFLINE_UNATTESTED',
    captureSessionId: null,
    nonce: Crypto.randomUUID(),
    appId: null,
    issuedAt: now,
    captureWindowEndsAt: null,
    tokenReplayDetected: null,
    deviceKeyProof: null,
  };
}

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ id: string; type: EvidenceType; returnPassportId?: string; connectSessionId?: string }>();
  const { id, returnPassportId, connectSessionId } = params;
  const rawType = params.type;
  const type = rawType && titles[rawType] ? rawType : 'CONDITION_PHOTO';
  const isVideo = videoTypes.has(type);
  const router = useRouter();
  const { user } = useAuth();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [stage, setStage] = useState<'CHECKLIST' | 'CAMERA' | 'REVIEW' | 'UPLOADING'>('CHECKLIST');
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [includeLocation, setIncludeLocation] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [manifest, setManifest] = useState<CaptureManifestInput | null>(null);
  const [progress, setProgress] = useState(0);
  const [shippingLabel, setShippingLabel] = useState<ShippingLabelTelemetry | null>(null);
  const shippingLabelRef = useRef<ShippingLabelTelemetry | null>(null);

  const handleBarcodeScanned = ({ data, type: symbology }: { data: string; type: string }) => {
    if (!labelAwareTypes.has(type)) return;
    const trackingNumber = data.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 120);
    if (trackingNumber.length < 8) return;
    const next: ShippingLabelTelemetry = {
      trackingNumber,
      symbology: String(symbology).slice(0, 80),
      detectedAt: new Date().toISOString(),
      source: 'CAMERA_BARCODE_SCANNER',
    };
    if (shippingLabelRef.current?.trackingNumber === trackingNumber) return;
    shippingLabelRef.current = next;
    setShippingLabel(next);
  };

  const requestPermissions = async () => {
    const cameraResult = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    const micResult = !isVideo || microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
    if (!cameraResult?.granted || (isVideo && !micResult?.granted)) {
      Alert.alert('Permission required', 'Camera and microphone access are required to capture transaction evidence. You can change this in Android Settings.');
      return;
    }
    setStage('CAMERA');
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
    if (!camera.current || preparing) return;
    setPreparing(true);
    let collector: Awaited<ReturnType<typeof startCaptureTelemetry>> | null = null;
    let capturedUri: string | null = null;
    try {
      collector = await startCaptureTelemetry(includeLocation);
      let attestation: CaptureAttestation;
      try {
        attestation = await prepareCaptureAttestation({
          transactionId: id,
          returnPassportId: returnPassportId ?? null,
          connectSessionId: connectSessionId ?? null,
          runtimeIntegrity: collector.runtimeIntegrity,
        });
      } catch (error) {
        const network = await NetInfo.fetch();
        if (network.isConnected === false || network.isInternetReachable === false) attestation = offlineAttestation();
        else throw error;
      }

      const captureStartedAt = new Date().toISOString();
      let result: { uri?: string } | null | undefined = null;
      if (isVideo) {
        setRecording(true);
        setPreparing(false);
        result = await camera.current.recordAsync({ maxDuration: 900 });
        setRecording(false);
      } else {
        result = await camera.current.takePictureAsync({ quality: 0.92, exif: false, shutterSound: true });
        setPreparing(false);
      }
      capturedUri = result?.uri ?? null;
      const telemetry = await collector.finish();
      collector = null;
      if (result?.uri) {
        setLocalUri(result.uri);
        setManifest({
          schemaVersion: 1,
          captureStartedAt,
          captureFinishedAt: telemetry.finishedAt,
          runtimeIntegrity: telemetry.runtimeIntegrity,
          sensorFusion: telemetry.sensorFusion,
          networkTelemetry: telemetry.networkTelemetry,
          geolocation: telemetry.geolocation,
          shippingLabel: shippingLabelRef.current,
          attestation,
        });
        setStage('REVIEW');
      }
    } catch (error) {
      setRecording(false);
      setPreparing(false);
      if (collector) await collector.finish().catch(() => undefined);
      if (capturedUri) await FileSystem.deleteAsync(capturedUri, { idempotent: true }).catch(() => undefined);
      Alert.alert('Capture failed', readableError(error));
    }
  };

  const stop = () => camera.current?.stopRecording();

  const discard = async () => {
    if (localUri) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    setLocalUri(null);
    setManifest(null);
    shippingLabelRef.current = null;
    setShippingLabel(null);
    setStage('CAMERA');
  };

  const upload = async () => {
    if (!localUri || !id || !user) return;
    setStage('UPLOADING');
    setProgress(0);
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
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
      const result = await syncEvidenceQueue({ targetId: item.id, onProgress: setProgress });
      const uploaded = result.uploadedIds.includes(item.id);
      Alert.alert(
        uploaded ? 'Evidence uploaded' : 'Evidence secured offline',
        uploaded
          ? 'The encrypted queue transferred the original file. The server is independently hashing it and sealing the signed manifest.'
          : 'The original capture is encrypted in PackProof’s private queue and will sync automatically when a usable connection returns.',
        [{ text: 'Done', onPress: () => router.replace(`/transaction/${id}`) }],
      );
    } catch (error) {
      setStage('REVIEW');
      Alert.alert('Could not secure evidence', readableError(error));
    }
  };

  if (stage === 'CAMERA') return <View style={styles.cameraPage}>
    <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" mode={isVideo ? 'video' : 'picture'} videoQuality="720p" mute={false} onBarcodeScanned={labelAwareTypes.has(type) ? handleBarcodeScanned : undefined} barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'code93', 'qr', 'pdf417', 'aztec', 'ean13', 'ean8', 'upc_a', 'upc_e', 'itf14', 'datamatrix'] }} />
    <SafeAreaView style={styles.overlay}>
      <View style={styles.cameraHeader}><Pressable disabled={recording || preparing} onPress={() => router.back()} style={styles.circleButton}><SymbolView name="xmark" size={18} tintColor={colors.white} /></Pressable><View style={styles.captureLabel}><View style={[styles.liveDot, recording && { backgroundColor: colors.danger }]} /><Text style={styles.captureLabelText}>{preparing ? 'VERIFYING DEVICE…' : recording ? 'RECORDING · DO NOT PAUSE' : titles[type].toUpperCase()}</Text></View></View>
      <View style={styles.cameraFooter}>
        {labelAwareTypes.has(type) ? <View style={styles.barcodeBadge}><SymbolView name={shippingLabel ? 'checkmark.circle.fill' : 'barcode.viewfinder'} size={16} tintColor={shippingLabel ? colors.teal : colors.white} /><Text style={styles.barcodeText}>{shippingLabel ? `LABEL READ · ${shippingLabel.trackingNumber}` : 'AIM AT THE TRACKING BARCODE'}</Text></View> : null}
        <Text style={styles.cameraHelp}>{preparing ? 'Refreshing hardware attestation and starting forensic telemetry.' : recording ? 'Keep every relevant item and the package in frame. Hold steady for the final three seconds.' : isVideo ? 'Tap once to begin a continuous recording.' : 'Frame the evidence clearly, then capture.'}</Text>
        <Pressable accessibilityLabel={recording ? 'Stop recording' : 'Start capture'} disabled={preparing} onPress={recording ? stop : capture} style={[styles.shutter, recording && styles.shutterRecording, preparing && { opacity: 0.55 }]}><View style={[styles.shutterInner, recording && styles.stopInner]} /></Pressable>
      </View>
    </SafeAreaView>
  </View>;

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.container}>
    <Button label="Close" variant="ghost" onPress={() => router.back()} style={styles.close} disabled={stage === 'UPLOADING'} />
    {stage === 'CHECKLIST' ? <>
      <ScreenTitle eyebrow="Before you begin" title={titles[type]} subtitle={isVideo ? 'This must be one continuous, unedited recording. Prepare the package and supplies before you start.' : 'Capture an original image directly in PackProof so it stays connected to this transaction.'} />
      <Card style={styles.checklist}>{(checklists[type] ?? checklists.CONDITION_PHOTO!).map((item, index) => <View key={item} style={styles.check}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><Text style={styles.checkText}>{item}</Text></View>)}</Card>
      <Card style={styles.locationCard}><View style={{ flex: 1, gap: 4 }}><Text style={styles.locationTitle}>Include precise capture location</Text><Text style={styles.locationText}>Optional. When enabled, coordinates and accuracy are included in the signed forensic manifest. Leave off when location is unnecessary.</Text></View><Switch value={includeLocation} onValueChange={(value) => { changeLocationPreference(value).catch((error) => Alert.alert('Could not update location setting', readableError(error))); }} /></Card>
      <Card style={styles.caution}><SymbolView name="exclamationmark.triangle.fill" size={20} tintColor={colors.amber} /><Text style={styles.cautionText}>Do not capture payment cards, government IDs, private messages, unrelated faces or addresses not required for the shipping record.</Text></Card>
      <Button label="I’m ready to capture" icon="camera.fill" onPress={requestPermissions} />
    </> : null}
    {stage === 'REVIEW' ? <>
      <ScreenTitle eyebrow="Encrypted queue ready" title="Secure this evidence?" subtitle="PackProof will hash and encrypt the original capture before attempting any network transfer. It remains queued if connectivity drops." />
      <Card style={styles.review}><SymbolView name={isVideo ? 'video.fill' : 'photo.fill'} size={42} tintColor={colors.teal} /><Text style={styles.reviewTitle}>{titles[type]}</Text><Text style={styles.reviewText}>{manifest?.attestation.mode === 'JIT_APP_CHECK' ? 'Fresh device attestation bound to this capture.' : 'Captured offline; the manifest will truthfully record that live attestation was unavailable.'}{manifest?.shippingLabel ? ` Tracking barcode: ${manifest.shippingLabel.trackingNumber}.` : ''}</Text></Card>
      <Button label="Encrypt, hash and sync" icon="lock.shield.fill" onPress={upload} />
      <Button label="Discard and retake" variant="danger" onPress={discard} />
    </> : null}
    {stage === 'UPLOADING' ? <View style={styles.uploading}><SymbolView name="icloud.and.arrow.up.fill" size={48} tintColor={colors.teal} /><Text style={styles.uploadTitle}>Securing your evidence</Text><Text style={styles.uploadPercent}>{Math.round(progress * 100)}%</Text><ProgressBar value={progress} /><Text style={styles.uploadText}>The original is already being protected locally. You can lose connectivity without losing the capture; synchronization resumes automatically.</Text></View> : null}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, container: { flexGrow: 1, padding: 20, paddingBottom: 44, gap: 15 }, close: { alignSelf: 'flex-start', minHeight: 40 },
  checklist: { gap: 17 }, check: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, number: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(33,212,180,0.1)', alignItems: 'center', justifyContent: 'center' }, numberText: { color: colors.teal, fontSize: 12, fontWeight: '900' }, checkText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 20 },
  locationCard: { flexDirection: 'row', gap: 12, alignItems: 'center' }, locationTitle: { color: colors.ink, fontSize: 13, fontWeight: '800' }, locationText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  caution: { flexDirection: 'row', gap: 11, backgroundColor: 'rgba(255,190,85,0.06)' }, cautionText: { flex: 1, color: colors.amber, fontSize: 11, lineHeight: 17 },
  cameraPage: { flex: 1, backgroundColor: colors.black }, overlay: { flex: 1, justifyContent: 'space-between' }, cameraHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 }, circleButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }, captureLabel: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999 }, liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal }, captureLabelText: { color: colors.white, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  cameraFooter: { alignItems: 'center', gap: 18, padding: 24, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.38)' }, barcodeBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, barcodeText: { color: colors.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 }, cameraHelp: { color: colors.white, fontSize: 12, lineHeight: 18, textAlign: 'center' }, shutter: { width: 82, height: 82, borderRadius: 41, borderWidth: 5, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' }, shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white }, shutterRecording: { borderColor: colors.danger }, stopInner: { width: 31, height: 31, borderRadius: 7, backgroundColor: colors.danger },
  review: { alignItems: 'center', gap: 9, paddingVertical: 32 }, reviewTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' }, reviewText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  uploading: { flex: 1, justifyContent: 'center', gap: 16, paddingVertical: 80 }, uploadTitle: { color: colors.ink, fontSize: 25, fontWeight: '900', textAlign: 'center' }, uploadPercent: { color: colors.teal, fontSize: 36, fontWeight: '900', textAlign: 'center' }, uploadText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
