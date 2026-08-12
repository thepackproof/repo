export type DeviceKeyProof = {
  algorithm: 'SHA256withECDSA';
  keyAlias: string;
  publicKeySpkiBase64: string;
  challengeSignatureBase64: string;
  hardwareBacked: boolean;
};

export type ShippingLabelTelemetry = {
  trackingNumber: string;
  symbology: string;
  detectedAt: string;
  source: 'CAMERA_BARCODE_SCANNER';
};

export type RuntimeIntegrityTelemetry = {
  appVersion: string | null;
  nativeBuildVersion: string | null;
  applicationId: string | null;
  runtimeVersion: string | null;
  expoReleaseChannel: string | null;
  deviceBrand: string | null;
  deviceModel: string | null;
  osName: string | null;
  osVersion: string | null;
  runtimeArtifactHash: string;
  integrityScope: 'RUNTIME_METADATA_FINGERPRINT';
};

export type SensorFusionTelemetry = {
  sampleWindowMs: number;
  accelerometerSampleCount: number;
  gyroscopeSampleCount: number;
  accelerometerMagnitudeMeanG: number | null;
  accelerometerMagnitudeVariance: number | null;
  gyroscopeMagnitudeVariance: number | null;
  assessment: 'MOTION_DETECTED' | 'LOW_MOTION' | 'INSUFFICIENT_DATA';
  interpretation: 'CONTEXT_SIGNAL_ONLY';
};

export type NetworkTelemetry = {
  connectionType: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  cellularGeneration: string | null;
};

export type GeolocationTelemetry = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  altitudeMeters: number | null;
  capturedAt: string;
  permission: 'USER_OPT_IN';
};

export type CaptureAttestation = {
  mode: 'JIT_APP_CHECK' | 'OFFLINE_UNATTESTED';
  captureSessionId: string | null;
  nonce: string;
  appId: string | null;
  issuedAt: string;
  captureWindowEndsAt: string | null;
  tokenReplayDetected: boolean | null;
  reasonCodes: string[];
  deviceKeyProof: DeviceKeyProof | null;
  sessionMode?: 'SINGLE' | 'BATCH';
  maxEvidenceCount?: number;
  captureGroupId?: string | null;
};

export type CaptureProfileTelemetry = {
  profileId: 'packproof-digital-evidence';
  profileVersion: '2.0.0';
  profileScope: 'HUMAN_GUIDED_DIGITAL_EVIDENCE';
  requestedRegions: string[];
  observedRegions: string[];
  regionObservationMethod: 'USER_GUIDED_NOT_MACHINE_CONFIRMED';
  attempt: number;
};

export type CameraObservationTelemetry = {
  source: 'EXPO_CAMERA_ORIGINAL_OUTPUT';
  facing: 'BACK';
  mode: 'PHOTO' | 'VIDEO';
  widthPixels: number | null;
  heightPixels: number | null;
  orientation: number | null;
  flashMode: 'OFF';
  zoom: number;
  codec: 'PLATFORM_DEFAULT';
  metadataScope: 'LIMITED_BY_EXPO_CAMERA';
  packProofTransformationsBeforeHashing: 'NONE';
};

export type CaptureTimeTelemetry = {
  deviceWallStartedAt: string;
  deviceWallFinishedAt: string;
  monotonicElapsedMs: number;
  deviceWallProvenance: 'CLIENT_OBSERVED_UNTRUSTED';
  monotonicProvenance: 'CLIENT_OBSERVED_RELATIVE_ONLY';
  serverTimeProvenance: 'ADDED_AT_RECEIPT_AND_FINALIZATION';
};

export type AcquisitionQualityTelemetry = {
  status: 'NOT_EVALUATED';
  qualityProfileId: 'none';
  qualityProfileVersion: '0';
  reasonCodes: ['NO_CALIBRATED_QUALITY_GATE'];
};

export type PhysicalCorrespondenceTelemetry = {
  status: 'NOT_AVAILABLE';
  mode: 'PRODUCTION_DISABLED';
  reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'];
};

export type PhysicalCaptureProfileTelemetry = {
  profileId: 'PP-PHYSICAL-MATTE-V1';
  profileVersion: 1;
  qualityPolicyId: 'PP-QUALITY-V1';
  intendedUse: 'REFERENCE' | 'VERIFICATION';
  captureGroupId: string;
  acquisitionMode: 'GUIDED_MULTI_FRAME';
  requestedRegions: ('LABEL_IDENTIFIER' | 'INK_EDGE_A' | 'INK_EDGE_B' | 'LABEL_BOX_BOUNDARY' | 'ADJACENT_CARDBOARD')[];
  observedRegion: 'LABEL_IDENTIFIER' | 'INK_EDGE_A' | 'INK_EDGE_B' | 'LABEL_BOX_BOUNDARY' | 'ADJACENT_CARDBOARD';
  frameIndex: number;
  framesPerRegion: number;
  totalFrameCount: number;
  captureAttempt: number;
  clientImage: {
    widthPx: number | null;
    heightPx: number | null;
    gate: 'CLIENT_DIMENSION_PASS_SERVER_QUALITY_PENDING' | 'CLIENT_DIMENSION_FAIL';
    qualitySignals: {
      algorithm: 'PP_IMAGE_QUALITY_SIGNAL_V1';
      sourceWidthPx: number;
      sourceHeightPx: number;
      sampleWidthPx: number;
      sampleHeightPx: number;
      meanLuminance: number;
      luminanceStdDev: number;
      p05Luminance: number;
      p95Luminance: number;
      shadowClippingFraction: number;
      highlightClippingFraction: number;
      laplacianVariance: number;
      interpretation: 'MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED';
    };
  };
};

export type CaptureManifestInput = {
  schemaVersion: 2;
  captureId: string;
  captureStartedAt: string;
  captureFinishedAt: string;
  time: CaptureTimeTelemetry;
  captureProfile: CaptureProfileTelemetry;
  cameraObservation: CameraObservationTelemetry;
  acquisitionQuality: AcquisitionQualityTelemetry;
  physicalCorrespondence: PhysicalCorrespondenceTelemetry;
  physicalCaptureProfile?: PhysicalCaptureProfileTelemetry | null;
  runtimeIntegrity: RuntimeIntegrityTelemetry;
  sensorFusion: SensorFusionTelemetry;
  networkTelemetry: NetworkTelemetry;
  geolocation: GeolocationTelemetry | null;
  shippingLabel: ShippingLabelTelemetry | null;
  attestation: CaptureAttestation;
};
