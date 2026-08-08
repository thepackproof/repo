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
  humanHoldLikely: boolean | null;
  assessment: 'HANDHELD_LIKELY' | 'FIXED_OR_LOW_MOTION' | 'INSUFFICIENT_DATA';
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
  deviceKeyProof: DeviceKeyProof | null;
};

export type CaptureManifestInput = {
  schemaVersion: 1;
  captureStartedAt: string;
  captureFinishedAt: string;
  runtimeIntegrity: RuntimeIntegrityTelemetry;
  sensorFusion: SensorFusionTelemetry;
  networkTelemetry: NetworkTelemetry;
  geolocation: GeolocationTelemetry | null;
  shippingLabel: ShippingLabelTelemetry | null;
  attestation: CaptureAttestation;
};
