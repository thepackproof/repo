import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import type { GeolocationTelemetry, NetworkTelemetry, RuntimeIntegrityTelemetry, SensorFusionTelemetry } from '@/types/telemetry';

type VectorSample = { x: number; y: number; z: number; at: number };

type TelemetryCollector = {
  startedAt: string;
  runtimeIntegrity: RuntimeIntegrityTelemetry;
  markCaptureStarted(): string;
  finish(): Promise<{
    finishedAt: string;
    monotonicElapsedMs: number;
    runtimeIntegrity: RuntimeIntegrityTelemetry;
    sensorFusion: SensorFusionTelemetry;
    networkTelemetry: NetworkTelemetry;
    geolocation: GeolocationTelemetry | null;
  }>;
};

const SAMPLE_INTERVAL_MS = 50;
const ANALYSIS_WINDOW_MS = 3000;
const MAX_SAMPLES = 1800;

function monotonicNow(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function magnitude(sample: VectorSample): number {
  return Math.sqrt(sample.x ** 2 + sample.y ** 2 + sample.z ** 2);
}

function variance(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function round(value: number | null, digits = 8): number | null {
  return value == null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

async function collectRuntimeIntegrity(): Promise<RuntimeIntegrityTelemetry> {
  const runtimeVersion = typeof Constants.expoConfig?.runtimeVersion === 'string'
    ? Constants.expoConfig.runtimeVersion
    : Constants.expoConfig?.runtimeVersion
      ? JSON.stringify(Constants.expoConfig.runtimeVersion)
      : null;
  const fields = {
    appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null,
    nativeBuildVersion: Application.nativeBuildVersion ?? null,
    applicationId: Application.applicationId ?? null,
    runtimeVersion,
    expoReleaseChannel: Constants.expoConfig?.updates?.url ? String(Constants.expoConfig.updates.url) : null,
    deviceBrand: Device.brand ?? null,
    deviceModel: Device.modelName ?? null,
    osName: Device.osName ?? Platform.OS,
    osVersion: Device.osVersion ?? null,
  };
  const runtimeArtifactHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(fields),
  );
  return { ...fields, runtimeArtifactHash, integrityScope: 'RUNTIME_METADATA_FINGERPRINT' };
}

async function collectNetwork(): Promise<NetworkTelemetry> {
  const state = await NetInfo.fetch();
  const cellularGeneration = state.type === 'cellular' && 'cellularGeneration' in state.details
    ? state.details.cellularGeneration ?? null
    : null;
  return {
    connectionType: state.type,
    isConnected: state.isConnected,
    isInternetReachable: state.isInternetReachable,
    cellularGeneration,
  };
}

async function collectLocation(enabled: boolean): Promise<GeolocationTelemetry | null> {
  if (!enabled) return null;
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return {
    latitude: Number(result.coords.latitude.toFixed(6)),
    longitude: Number(result.coords.longitude.toFixed(6)),
    accuracyMeters: round(result.coords.accuracy, 2),
    altitudeMeters: round(result.coords.altitude, 2),
    capturedAt: new Date(result.timestamp).toISOString(),
    permission: 'USER_OPT_IN',
  };
}

export async function startCaptureTelemetry(includeLocation: boolean): Promise<TelemetryCollector> {
  const startedAt = new Date().toISOString();
  let monotonicCaptureStartedAt = monotonicNow();
  const accelerometer: VectorSample[] = [];
  const gyroscope: VectorSample[] = [];
  Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
  Gyroscope.setUpdateInterval(SAMPLE_INTERVAL_MS);
  const accelerometerSubscription = Accelerometer.addListener((sample) => {
    accelerometer.push({ ...sample, at: monotonicNow() });
    if (accelerometer.length > MAX_SAMPLES) accelerometer.shift();
  });
  const gyroscopeSubscription = Gyroscope.addListener((sample) => {
    gyroscope.push({ ...sample, at: monotonicNow() });
    if (gyroscope.length > MAX_SAMPLES) gyroscope.shift();
  });

  const networkPromise = collectNetwork().catch((): NetworkTelemetry => ({
    connectionType: 'unknown',
    isConnected: null,
    isInternetReachable: null,
    cellularGeneration: null,
  }));
  const geolocationPromise = collectLocation(includeLocation).catch(() => null);
  let runtimeIntegrity: RuntimeIntegrityTelemetry;
  try {
    // Runtime metadata is needed to bind the just-in-time attestation request.
    // Location and network collection continue concurrently and never hold the
    // record button open after this lightweight fingerprint is available.
    runtimeIntegrity = await collectRuntimeIntegrity();
  } catch (error) {
    accelerometerSubscription.remove();
    gyroscopeSubscription.remove();
    throw error;
  }

  return {
    startedAt,
    runtimeIntegrity,
    markCaptureStarted() {
      accelerometer.length = 0;
      gyroscope.length = 0;
      monotonicCaptureStartedAt = monotonicNow();
      return new Date().toISOString();
    },
    async finish() {
      accelerometerSubscription.remove();
      gyroscopeSubscription.remove();
      const finishedAt = new Date().toISOString();
      const monotonicFinishedAt = monotonicNow();
      const cutoff = monotonicFinishedAt - ANALYSIS_WINDOW_MS;
      const accelerometerWindow = accelerometer.filter((sample) => sample.at >= cutoff);
      const gyroscopeWindow = gyroscope.filter((sample) => sample.at >= cutoff);
      const accelerometerMagnitudes = accelerometerWindow.map(magnitude);
      const gyroscopeMagnitudes = gyroscopeWindow.map(magnitude);
      const accelerometerMagnitudeVariance = variance(accelerometerMagnitudes);
      const gyroscopeMagnitudeVariance = variance(gyroscopeMagnitudes);
      const accelerometerMagnitudeMeanG = accelerometerMagnitudes.length
        ? accelerometerMagnitudes.reduce((sum, value) => sum + value, 0) / accelerometerMagnitudes.length
        : null;
      const sufficient = accelerometerWindow.length >= 20 && gyroscopeWindow.length >= 20;
      const motionObserved = sufficient
        && ((accelerometerMagnitudeVariance ?? 0) > 0.0000005 || (gyroscopeMagnitudeVariance ?? 0) > 0.0000005);
      const sensorFusion: SensorFusionTelemetry = {
        sampleWindowMs: ANALYSIS_WINDOW_MS,
        accelerometerSampleCount: accelerometerWindow.length,
        gyroscopeSampleCount: gyroscopeWindow.length,
        accelerometerMagnitudeMeanG: round(accelerometerMagnitudeMeanG, 6),
        accelerometerMagnitudeVariance: round(accelerometerMagnitudeVariance),
        gyroscopeMagnitudeVariance: round(gyroscopeMagnitudeVariance),
        assessment: !sufficient ? 'INSUFFICIENT_DATA' : motionObserved ? 'MOTION_DETECTED' : 'LOW_MOTION',
        interpretation: 'CONTEXT_SIGNAL_ONLY',
      };
      const [networkTelemetry, geolocation] = await Promise.all([networkPromise, geolocationPromise]);
      return {
        finishedAt,
        monotonicElapsedMs: Math.max(0, Math.round(monotonicFinishedAt - monotonicCaptureStartedAt)),
        runtimeIntegrity,
        sensorFusion,
        networkTelemetry,
        geolocation,
      };
    },
  };
}
