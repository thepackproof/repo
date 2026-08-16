import { evidenceTypes } from './types';
import type { EvidenceType } from './types';

type Issue = { path: string; message: string };

export class ValidationError extends Error {
  readonly issues: Issue[];
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
    this.issues = [{ path, message }];
  }
}

type Schema<T> = { parse(value: unknown): T };

function schema<T>(parser: (value: unknown) => T): Schema<T> {
  return { parse: parser };
}

function object(value: unknown, path = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(path, 'must be an object');
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, min: number, max: number, options: { optional?: boolean; nullable?: boolean; defaultValue?: string; trim?: boolean; pattern?: RegExp } = {}): string | undefined | null {
  if (value === undefined) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    if (options.optional) return undefined;
    throw new ValidationError(path, 'is required');
  }
  if (value === null && options.nullable) return null;
  if (typeof value !== 'string') throw new ValidationError(path, 'must be a string');
  const result = options.trim === false ? value : value.trim();
  for (let index = 0; index < result.length; index += 1) {
    const codeUnit = result.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = result.charCodeAt(index + 1);
      if (index + 1 >= result.length || next < 0xdc00 || next > 0xdfff) throw new ValidationError(path, 'must contain well-formed Unicode');
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new ValidationError(path, 'must contain well-formed Unicode');
    }
  }
  if (result.length < min || result.length > max) throw new ValidationError(path, `must contain ${min}-${max} characters`);
  if (options.pattern && !options.pattern.test(result)) throw new ValidationError(path, 'has an invalid format');
  return result;
}

function optionalId(value: unknown, path: string): string | null | undefined {
  return text(value, path, 8, 160, { optional: true, nullable: true }) as string | null | undefined;
}

function numberValue(value: unknown, path: string, min: number, max: number, options: { optional?: boolean; defaultValue?: number; integer?: boolean; positive?: boolean; nullable?: boolean } = {}): number | undefined | null {
  if (value === undefined) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    if (options.optional) return undefined;
    throw new ValidationError(path, 'is required');
  }
  if (value === null && options.nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ValidationError(path, 'must be a finite number');
  if (options.integer && !Number.isInteger(value)) throw new ValidationError(path, 'must be an integer');
  if (options.positive && value <= 0) throw new ValidationError(path, 'must be greater than zero');
  if (value < min || value > max) throw new ValidationError(path, `must be between ${min} and ${max}`);
  return value;
}

function booleanValue(value: unknown, path: string, nullable = false): boolean | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'boolean') throw new ValidationError(path, 'must be a boolean');
  return value;
}

function enumValue<T extends string>(value: unknown, path: string, allowed: readonly T[], defaultValue?: T): T {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new ValidationError(path, `must be one of: ${allowed.join(', ')}`);
  return value as T;
}

function isoDate(value: unknown, path: string, options: { optional?: boolean; nullable?: boolean } = {}): string | undefined | null {
  const parsed = text(value, path, 1, 80, options);
  if (parsed === undefined || parsed === null) return parsed;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(parsed) || Number.isNaN(Date.parse(parsed))) throw new ValidationError(path, 'must be an ISO-8601 timestamp');
  return parsed;
}

function nullableText(value: unknown, path: string, max: number): string | null {
  return text(value, path, 0, max, { nullable: true, trim: false }) as string | null;
}

function textArray(value: unknown, path: string, maxItems: number, itemMax = 120): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new ValidationError(path, `must be an array with no more than ${maxItems} entries`);
  return value.map((item, index) => text(item, `${path}[${index}]`, 1, itemMax, { pattern: /^[A-Z0-9_-]+$/ }) as string);
}

function urlText(value: unknown, path: string, max = 1000): string {
  const result = text(value, path, 1, max) as string;
  try { new URL(result); } catch { throw new ValidationError(path, 'must be a valid URL'); }
  return result;
}

function transactionId(value: unknown, path = 'transactionId'): string {
  return text(value, path, 10, 128) as string;
}

export const transactionDraftSchema = schema((value) => {
  const input = object(value);
  const terms = object(input.terms, 'terms');
  const rawIdentifiers = input.identifiers ?? [];
  if (!Array.isArray(rawIdentifiers) || rawIdentifiers.length > 20) throw new ValidationError('identifiers', 'must be an array with no more than 20 entries');
  const identifiers = rawIdentifiers.map((entry, index) => {
    const item = object(entry, `identifiers[${index}]`);
    return {
      label: text(item.label, `identifiers[${index}].label`, 1, 200) as string,
      value: text(item.value, `identifiers[${index}].value`, 1, 200) as string,
    };
  });
  return {
    transactionId: text(input.transactionId, 'transactionId', 10, 128, { optional: true }) as string | undefined,
    title: text(input.title, 'title', 1, 200) as string,
    category: text(input.category, 'category', 1, 80) as string,
    description: text(input.description, 'description', 0, 10_000, { defaultValue: '' }) as string,
    priceMinor: numberValue(input.priceMinor, 'priceMinor', 0, 10_000_000_000, { integer: true }) as number,
    currency: text(input.currency ?? 'USD', 'currency', 3, 3, { pattern: /^[A-Z]{3}$/ }) as string,
    identifiers,
    conditionNotes: text(input.conditionNotes, 'conditionNotes', 0, 10_000, { defaultValue: '' }) as string,
    terms: {
      saleType: enumValue(terms.saleType, 'terms.saleType', ['SHIPPED', 'LOCAL_HANDOFF'] as const, 'SHIPPED'),
      shippingResponsibility: enumValue(terms.shippingResponsibility, 'terms.shippingResponsibility', ['SELLER', 'BUYER', 'NOT_APPLICABLE'] as const, 'SELLER'),
      returns: enumValue(terms.returns, 'terms.returns', ['NO_RETURNS', 'AS_AGREED', 'PLATFORM_POLICY'] as const, 'AS_AGREED'),
      returnWindowDays: numberValue(terms.returnWindowDays, 'terms.returnWindowDays', 0, 365, { integer: true, defaultValue: 0 }) as number,
      customTerms: text(terms.customTerms, 'terms.customTerms', 0, 10_000, { defaultValue: '' }) as string,
    },
  };
});

export const transactionIdSchema = schema((value) => ({ transactionId: transactionId(object(value).transactionId) }));
export const inviteCodeSchema = schema((value) => ({ code: text(object(value).code, 'code', 20, 160) as string }));

function parseRuntimeIntegrity(value: unknown) {
  const input = object(value, 'manifest.runtimeIntegrity');
  return {
    appVersion: nullableText(input.appVersion, 'manifest.runtimeIntegrity.appVersion', 80),
    nativeBuildVersion: nullableText(input.nativeBuildVersion, 'manifest.runtimeIntegrity.nativeBuildVersion', 80),
    applicationId: nullableText(input.applicationId, 'manifest.runtimeIntegrity.applicationId', 200),
    runtimeVersion: nullableText(input.runtimeVersion, 'manifest.runtimeIntegrity.runtimeVersion', 200),
    expoReleaseChannel: nullableText(input.expoReleaseChannel, 'manifest.runtimeIntegrity.expoReleaseChannel', 500),
    deviceBrand: nullableText(input.deviceBrand, 'manifest.runtimeIntegrity.deviceBrand', 120),
    deviceModel: nullableText(input.deviceModel, 'manifest.runtimeIntegrity.deviceModel', 160),
    osName: nullableText(input.osName, 'manifest.runtimeIntegrity.osName', 80),
    osVersion: nullableText(input.osVersion, 'manifest.runtimeIntegrity.osVersion', 80),
    runtimeArtifactHash: text(input.runtimeArtifactHash, 'manifest.runtimeIntegrity.runtimeArtifactHash', 64, 64, { pattern: /^[a-f0-9]{64}$/i }) as string,
    integrityScope: enumValue(input.integrityScope, 'manifest.runtimeIntegrity.integrityScope', ['RUNTIME_METADATA_FINGERPRINT'] as const),
  };
}

function parseSensorFusion(value: unknown, schemaVersion: 1 | 2) {
  const input = object(value, 'manifest.sensorFusion');
  const common = {
    sampleWindowMs: numberValue(input.sampleWindowMs, 'manifest.sensorFusion.sampleWindowMs', 0, 30_000, { integer: true }) as number,
    accelerometerSampleCount: numberValue(input.accelerometerSampleCount, 'manifest.sensorFusion.accelerometerSampleCount', 0, 10_000, { integer: true }) as number,
    gyroscopeSampleCount: numberValue(input.gyroscopeSampleCount, 'manifest.sensorFusion.gyroscopeSampleCount', 0, 10_000, { integer: true }) as number,
    accelerometerMagnitudeMeanG: numberValue(input.accelerometerMagnitudeMeanG, 'manifest.sensorFusion.accelerometerMagnitudeMeanG', -1_000_000, 1_000_000, { nullable: true }) as number | null,
    accelerometerMagnitudeVariance: numberValue(input.accelerometerMagnitudeVariance, 'manifest.sensorFusion.accelerometerMagnitudeVariance', 0, 1_000_000, { nullable: true }) as number | null,
    gyroscopeMagnitudeVariance: numberValue(input.gyroscopeMagnitudeVariance, 'manifest.sensorFusion.gyroscopeMagnitudeVariance', 0, 1_000_000, { nullable: true }) as number | null,
  };
  return schemaVersion === 1 ? {
    ...common,
    humanHoldLikely: booleanValue(input.humanHoldLikely, 'manifest.sensorFusion.humanHoldLikely', true),
    assessment: enumValue(input.assessment, 'manifest.sensorFusion.assessment', ['HANDHELD_LIKELY', 'FIXED_OR_LOW_MOTION', 'INSUFFICIENT_DATA'] as const),
  } : {
    ...common,
    assessment: enumValue(input.assessment, 'manifest.sensorFusion.assessment', ['MOTION_DETECTED', 'LOW_MOTION', 'INSUFFICIENT_DATA'] as const),
    interpretation: enumValue(input.interpretation, 'manifest.sensorFusion.interpretation', ['CONTEXT_SIGNAL_ONLY'] as const),
  };
}

function parseCaptureTime(value: unknown) {
  const input = object(value, 'manifest.time');
  return {
    deviceWallStartedAt: isoDate(input.deviceWallStartedAt, 'manifest.time.deviceWallStartedAt') as string,
    deviceWallFinishedAt: isoDate(input.deviceWallFinishedAt, 'manifest.time.deviceWallFinishedAt') as string,
    monotonicElapsedMs: numberValue(input.monotonicElapsedMs, 'manifest.time.monotonicElapsedMs', 0, 16 * 60_000, { integer: true }) as number,
    deviceWallProvenance: enumValue(input.deviceWallProvenance, 'manifest.time.deviceWallProvenance', ['CLIENT_OBSERVED_UNTRUSTED'] as const),
    monotonicProvenance: enumValue(input.monotonicProvenance, 'manifest.time.monotonicProvenance', ['CLIENT_OBSERVED_RELATIVE_ONLY'] as const),
    serverTimeProvenance: enumValue(input.serverTimeProvenance, 'manifest.time.serverTimeProvenance', ['ADDED_AT_RECEIPT_AND_FINALIZATION'] as const),
  };
}

function parseCaptureProfile(value: unknown) {
  const input = object(value, 'manifest.captureProfile');
  return {
    profileId: enumValue(input.profileId, 'manifest.captureProfile.profileId', ['packproof-digital-evidence'] as const),
    profileVersion: enumValue(input.profileVersion, 'manifest.captureProfile.profileVersion', ['2.0.0'] as const),
    profileScope: enumValue(input.profileScope, 'manifest.captureProfile.profileScope', ['HUMAN_GUIDED_DIGITAL_EVIDENCE'] as const),
    requestedRegions: textArray(input.requestedRegions, 'manifest.captureProfile.requestedRegions', 30),
    observedRegions: textArray(input.observedRegions, 'manifest.captureProfile.observedRegions', 30),
    regionObservationMethod: enumValue(input.regionObservationMethod, 'manifest.captureProfile.regionObservationMethod', ['USER_GUIDED_NOT_MACHINE_CONFIRMED'] as const),
    attempt: numberValue(input.attempt, 'manifest.captureProfile.attempt', 1, 10_000, { integer: true }) as number,
  };
}

function parseCameraObservation(value: unknown) {
  const input = object(value, 'manifest.cameraObservation');
  return {
    source: enumValue(input.source, 'manifest.cameraObservation.source', ['EXPO_CAMERA_ORIGINAL_OUTPUT'] as const),
    facing: enumValue(input.facing, 'manifest.cameraObservation.facing', ['BACK'] as const),
    mode: enumValue(input.mode, 'manifest.cameraObservation.mode', ['PHOTO', 'VIDEO'] as const),
    widthPixels: numberValue(input.widthPixels, 'manifest.cameraObservation.widthPixels', 1, 100_000, { nullable: true, integer: true }) as number | null,
    heightPixels: numberValue(input.heightPixels, 'manifest.cameraObservation.heightPixels', 1, 100_000, { nullable: true, integer: true }) as number | null,
    orientation: numberValue(input.orientation, 'manifest.cameraObservation.orientation', 0, 359, { nullable: true, integer: true }) as number | null,
    flashMode: enumValue(input.flashMode, 'manifest.cameraObservation.flashMode', ['OFF', 'AUTO', 'ON', 'TORCH'] as const),
    zoom: numberValue(input.zoom, 'manifest.cameraObservation.zoom', 0, 1) as number,
    codec: enumValue(input.codec, 'manifest.cameraObservation.codec', ['PLATFORM_DEFAULT'] as const),
    metadataScope: enumValue(input.metadataScope, 'manifest.cameraObservation.metadataScope', ['LIMITED_BY_EXPO_CAMERA'] as const),
    packProofTransformationsBeforeHashing: enumValue(input.packProofTransformationsBeforeHashing, 'manifest.cameraObservation.packProofTransformationsBeforeHashing', ['NONE'] as const),
  };
}

function parseAcquisitionQuality(value: unknown) {
  const input = object(value, 'manifest.acquisitionQuality');
  return {
    status: enumValue(input.status, 'manifest.acquisitionQuality.status', ['NOT_EVALUATED'] as const),
    qualityProfileId: enumValue(input.qualityProfileId, 'manifest.acquisitionQuality.qualityProfileId', ['none'] as const),
    qualityProfileVersion: enumValue(input.qualityProfileVersion, 'manifest.acquisitionQuality.qualityProfileVersion', ['0'] as const),
    reasonCodes: textArray(input.reasonCodes, 'manifest.acquisitionQuality.reasonCodes', 10),
  };
}

function parsePhysicalCorrespondence(value: unknown) {
  const input = object(value, 'manifest.physicalCorrespondence');
  return {
    status: enumValue(input.status, 'manifest.physicalCorrespondence.status', ['NOT_AVAILABLE'] as const),
    mode: enumValue(input.mode, 'manifest.physicalCorrespondence.mode', ['PRODUCTION_DISABLED'] as const),
    reasonCodes: textArray(input.reasonCodes, 'manifest.physicalCorrespondence.reasonCodes', 10),
  };
}

const physicalRegionIds = ['LABEL_IDENTIFIER', 'INK_EDGE_A', 'INK_EDGE_B', 'LABEL_BOX_BOUNDARY', 'ADJACENT_CARDBOARD'] as const;

function parsePhysicalCaptureProfile(value: unknown) {
  if (value === undefined || value === null) return null;
  const input = object(value, 'manifest.physicalCaptureProfile');
  if (!Array.isArray(input.requestedRegions) || input.requestedRegions.length !== physicalRegionIds.length) {
    throw new ValidationError('manifest.physicalCaptureProfile.requestedRegions', 'must equal the five-region frozen capture plan');
  }
  const requestedRegions = input.requestedRegions.map((region, index) => enumValue(region, `manifest.physicalCaptureProfile.requestedRegions[${index}]`, physicalRegionIds));
  if (requestedRegions.some((region, index) => region !== physicalRegionIds[index])) {
    throw new ValidationError('manifest.physicalCaptureProfile.requestedRegions', 'must preserve the frozen region order');
  }
  const observedRegion = enumValue(input.observedRegion, 'manifest.physicalCaptureProfile.observedRegion', physicalRegionIds);
  const frameIndex = numberValue(input.frameIndex, 'manifest.physicalCaptureProfile.frameIndex', 0, 14, { integer: true }) as number;
  if (observedRegion !== physicalRegionIds[Math.floor(frameIndex / 3)]) {
    throw new ValidationError('manifest.physicalCaptureProfile.observedRegion', 'does not match the frozen frame/region sequence');
  }
  numberValue(input.framesPerRegion, 'manifest.physicalCaptureProfile.framesPerRegion', 3, 3, { integer: true });
  numberValue(input.totalFrameCount, 'manifest.physicalCaptureProfile.totalFrameCount', 15, 15, { integer: true });
  const clientImage = object(input.clientImage, 'manifest.physicalCaptureProfile.clientImage');
  const widthPx = numberValue(clientImage.widthPx, 'manifest.physicalCaptureProfile.clientImage.widthPx', 1, 20_000, { nullable: true, integer: true }) as number | null;
  const heightPx = numberValue(clientImage.heightPx, 'manifest.physicalCaptureProfile.clientImage.heightPx', 1, 20_000, { nullable: true, integer: true }) as number | null;
  const gate = enumValue(clientImage.gate, 'manifest.physicalCaptureProfile.clientImage.gate', ['CLIENT_DIMENSION_PASS_SERVER_QUALITY_PENDING', 'CLIENT_DIMENSION_FAIL'] as const);
  if (gate === 'CLIENT_DIMENSION_PASS_SERVER_QUALITY_PENDING') {
    const longest = Math.max(widthPx ?? 0, heightPx ?? 0);
    const shortest = Math.min(widthPx ?? 0, heightPx ?? 0);
    if (longest < 1600 || shortest < 1200) {
      throw new ValidationError('manifest.physicalCaptureProfile.clientImage.gate', 'is inconsistent with the declared image dimensions');
    }
  }
  const signalsInput = object(clientImage.qualitySignals, 'manifest.physicalCaptureProfile.clientImage.qualitySignals');
  const qualitySignals = {
    algorithm: enumValue(signalsInput.algorithm, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.algorithm', ['PP_IMAGE_QUALITY_SIGNAL_V1'] as const),
    sourceWidthPx: numberValue(signalsInput.sourceWidthPx, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.sourceWidthPx', 1, 20_000, { integer: true }) as number,
    sourceHeightPx: numberValue(signalsInput.sourceHeightPx, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.sourceHeightPx', 1, 20_000, { integer: true }) as number,
    sampleWidthPx: numberValue(signalsInput.sampleWidthPx, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.sampleWidthPx', 3, 1024, { integer: true }) as number,
    sampleHeightPx: numberValue(signalsInput.sampleHeightPx, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.sampleHeightPx', 3, 1024, { integer: true }) as number,
    meanLuminance: numberValue(signalsInput.meanLuminance, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.meanLuminance', 0, 255) as number,
    luminanceStdDev: numberValue(signalsInput.luminanceStdDev, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.luminanceStdDev', 0, 255) as number,
    p05Luminance: numberValue(signalsInput.p05Luminance, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.p05Luminance', 0, 255, { integer: true }) as number,
    p95Luminance: numberValue(signalsInput.p95Luminance, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.p95Luminance', 0, 255, { integer: true }) as number,
    shadowClippingFraction: numberValue(signalsInput.shadowClippingFraction, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.shadowClippingFraction', 0, 1) as number,
    highlightClippingFraction: numberValue(signalsInput.highlightClippingFraction, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.highlightClippingFraction', 0, 1) as number,
    laplacianVariance: numberValue(signalsInput.laplacianVariance, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.laplacianVariance', 0, 1_000_000_000) as number,
    interpretation: enumValue(signalsInput.interpretation, 'manifest.physicalCaptureProfile.clientImage.qualitySignals.interpretation', ['MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED'] as const),
  };
  const dimensionsMatch = (qualitySignals.sourceWidthPx === widthPx && qualitySignals.sourceHeightPx === heightPx)
    || (qualitySignals.sourceWidthPx === heightPx && qualitySignals.sourceHeightPx === widthPx);
  if (!dimensionsMatch) {
    throw new ValidationError('manifest.physicalCaptureProfile.clientImage.qualitySignals', 'source dimensions must match the captured image dimensions');
  }
  return {
    profileId: enumValue(input.profileId, 'manifest.physicalCaptureProfile.profileId', ['PP-PHYSICAL-MATTE-V1'] as const),
    profileVersion: numberValue(input.profileVersion, 'manifest.physicalCaptureProfile.profileVersion', 1, 1, { integer: true }) as number,
    qualityPolicyId: enumValue(input.qualityPolicyId, 'manifest.physicalCaptureProfile.qualityPolicyId', ['PP-QUALITY-V1'] as const),
    intendedUse: enumValue(input.intendedUse, 'manifest.physicalCaptureProfile.intendedUse', ['REFERENCE', 'VERIFICATION'] as const),
    captureGroupId: text(input.captureGroupId, 'manifest.physicalCaptureProfile.captureGroupId', 8, 160, { pattern: /^[A-Za-z0-9_-]+$/ }) as string,
    acquisitionMode: enumValue(input.acquisitionMode, 'manifest.physicalCaptureProfile.acquisitionMode', ['GUIDED_MULTI_FRAME'] as const),
    requestedRegions,
    observedRegion,
    frameIndex,
    framesPerRegion: 3 as const,
    totalFrameCount: 15 as const,
    captureAttempt: numberValue(input.captureAttempt, 'manifest.physicalCaptureProfile.captureAttempt', 1, 20, { integer: true }) as number,
    clientImage: { widthPx, heightPx, gate, qualitySignals },
  };
}

function parseNetworkTelemetry(value: unknown) {
  const input = object(value, 'manifest.networkTelemetry');
  return {
    connectionType: text(input.connectionType, 'manifest.networkTelemetry.connectionType', 0, 80, { trim: false }) as string,
    isConnected: booleanValue(input.isConnected, 'manifest.networkTelemetry.isConnected', true),
    isInternetReachable: booleanValue(input.isInternetReachable, 'manifest.networkTelemetry.isInternetReachable', true),
    cellularGeneration: nullableText(input.cellularGeneration, 'manifest.networkTelemetry.cellularGeneration', 40),
  };
}

function parseGeolocation(value: unknown) {
  if (value === null) return null;
  const input = object(value, 'manifest.geolocation');
  return {
    latitude: numberValue(input.latitude, 'manifest.geolocation.latitude', -90, 90) as number,
    longitude: numberValue(input.longitude, 'manifest.geolocation.longitude', -180, 180) as number,
    accuracyMeters: numberValue(input.accuracyMeters, 'manifest.geolocation.accuracyMeters', 0, 100_000, { nullable: true }) as number | null,
    altitudeMeters: numberValue(input.altitudeMeters, 'manifest.geolocation.altitudeMeters', -20_000, 100_000, { nullable: true }) as number | null,
    capturedAt: isoDate(input.capturedAt, 'manifest.geolocation.capturedAt') as string,
    permission: enumValue(input.permission, 'manifest.geolocation.permission', ['USER_OPT_IN'] as const),
  };
}

function parseDeviceKeyProof(value: unknown) {
  if (value === null) return null;
  const input = object(value, 'manifest.attestation.deviceKeyProof');
  return {
    algorithm: enumValue(input.algorithm, 'manifest.attestation.deviceKeyProof.algorithm', ['SHA256withECDSA'] as const),
    keyAlias: text(input.keyAlias, 'manifest.attestation.deviceKeyProof.keyAlias', 1, 120) as string,
    publicKeySpkiBase64: text(input.publicKeySpkiBase64, 'manifest.attestation.deviceKeyProof.publicKeySpkiBase64', 40, 2000, { pattern: /^[A-Za-z0-9+/=]+$/ }) as string,
    challengeSignatureBase64: text(input.challengeSignatureBase64, 'manifest.attestation.deviceKeyProof.challengeSignatureBase64', 40, 2000, { pattern: /^[A-Za-z0-9+/=]+$/ }) as string,
    hardwareBacked: booleanValue(input.hardwareBacked, 'manifest.attestation.deviceKeyProof.hardwareBacked'),
  };
}

function parseAttestation(value: unknown, schemaVersion: 1 | 2) {
  const input = object(value, 'manifest.attestation');
  const sessionMode = input.sessionMode === undefined
    ? undefined
    : enumValue(input.sessionMode, 'manifest.attestation.sessionMode', ['SINGLE', 'BATCH'] as const);
  return {
    mode: enumValue(input.mode, 'manifest.attestation.mode', ['JIT_APP_CHECK', 'OFFLINE_UNATTESTED'] as const),
    captureSessionId: text(input.captureSessionId, 'manifest.attestation.captureSessionId', 0, 160, { nullable: true, trim: false }) as string | null,
    nonce: text(input.nonce, 'manifest.attestation.nonce', 8, 256) as string,
    appId: text(input.appId, 'manifest.attestation.appId', 0, 300, { nullable: true, trim: false }) as string | null,
    issuedAt: isoDate(input.issuedAt, 'manifest.attestation.issuedAt') as string,
    captureWindowEndsAt: isoDate(input.captureWindowEndsAt, 'manifest.attestation.captureWindowEndsAt', { nullable: true }) as string | null,
    tokenReplayDetected: booleanValue(input.tokenReplayDetected, 'manifest.attestation.tokenReplayDetected', true),
    ...(schemaVersion === 2 ? { reasonCodes: textArray(input.reasonCodes ?? [], 'manifest.attestation.reasonCodes', 10) } : {}),
    deviceKeyProof: parseDeviceKeyProof(input.deviceKeyProof),
    ...(schemaVersion === 2 ? {
      sessionMode,
      maxEvidenceCount: numberValue(input.maxEvidenceCount, 'manifest.attestation.maxEvidenceCount', 1, 24, { optional: true, integer: true }) as number | undefined,
      captureGroupId: text(input.captureGroupId, 'manifest.attestation.captureGroupId', 0, 160, { optional: true, nullable: true, pattern: /^[A-Za-z0-9_-]+$/ }) as string | null | undefined,
    } : {}),
  };
}

function parseShippingLabel(value: unknown) {
  if (value === null || value === undefined) return null;
  const input = object(value, 'manifest.shippingLabel');
  const hasRawDecodedValue = input.rawDecodedValue !== undefined;
  const hasNormalizationProfile = input.normalizationProfile !== undefined;
  if (hasRawDecodedValue !== hasNormalizationProfile) {
    throw new ValidationError('manifest.shippingLabel', 'rawDecodedValue and normalizationProfile must be provided together');
  }
  return {
    ...(hasRawDecodedValue ? {
      rawDecodedValue: text(input.rawDecodedValue, 'manifest.shippingLabel.rawDecodedValue', 1, 512, { trim: false }) as string,
    } : {}),
    trackingNumber: text(input.trackingNumber, 'manifest.shippingLabel.trackingNumber', 8, 120, { pattern: /^[A-Z0-9]+$/ }) as string,
    ...(hasNormalizationProfile ? {
      normalizationProfile: enumValue(input.normalizationProfile, 'manifest.shippingLabel.normalizationProfile', ['PACKPROOF_TRACKING_ALNUM_V1'] as const),
    } : {}),
    symbology: text(input.symbology, 'manifest.shippingLabel.symbology', 1, 80) as string,
    detectedAt: isoDate(input.detectedAt, 'manifest.shippingLabel.detectedAt') as string,
    source: enumValue(input.source, 'manifest.shippingLabel.source', ['CAMERA_BARCODE_SCANNER'] as const),
  };
}

export const captureManifestInputSchema = schema((value) => {
  const input = object(value, 'manifest');
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2) throw new ValidationError('manifest.schemaVersion', 'must equal 1 or 2');
  const schemaVersion = input.schemaVersion as 1 | 2;
  const common = {
    schemaVersion,
    captureStartedAt: isoDate(input.captureStartedAt, 'manifest.captureStartedAt') as string,
    captureFinishedAt: isoDate(input.captureFinishedAt, 'manifest.captureFinishedAt') as string,
    runtimeIntegrity: parseRuntimeIntegrity(input.runtimeIntegrity),
    sensorFusion: parseSensorFusion(input.sensorFusion, schemaVersion),
    networkTelemetry: parseNetworkTelemetry(input.networkTelemetry),
    geolocation: parseGeolocation(input.geolocation),
    shippingLabel: parseShippingLabel(input.shippingLabel),
    attestation: parseAttestation(input.attestation, schemaVersion),
  };
  const parsed = schemaVersion === 1 ? common : {
    ...common,
    schemaVersion: 2 as const,
    captureId: text(input.captureId, 'manifest.captureId', 20, 80, { pattern: /^[A-Za-z0-9-]+$/ }) as string,
    time: parseCaptureTime(input.time),
    captureProfile: parseCaptureProfile(input.captureProfile),
    cameraObservation: parseCameraObservation(input.cameraObservation),
    acquisitionQuality: parseAcquisitionQuality(input.acquisitionQuality),
    physicalCorrespondence: parsePhysicalCorrespondence(input.physicalCorrespondence),
    physicalCaptureProfile: parsePhysicalCaptureProfile(input.physicalCaptureProfile),
  };
  if (JSON.stringify(parsed).length > 32_000) throw new ValidationError('manifest', 'is too large');
  return parsed;
});

export const captureSessionSchema = schema((value) => {
  const input = object(value);
  return {
    transactionId: transactionId(input.transactionId),
    returnPassportId: optionalId(input.returnPassportId, 'returnPassportId'),
    connectSessionId: optionalId(input.connectSessionId, 'connectSessionId'),
    runtimeArtifactHash: text(input.runtimeArtifactHash, 'runtimeArtifactHash', 64, 64, { optional: true, nullable: true, pattern: /^[a-f0-9]{64}$/i }) as string | null | undefined,
    captureProfileId: text(input.captureProfileId, 'captureProfileId', 0, 120, { optional: true, nullable: true, pattern: /^[A-Za-z0-9._-]+$/ }) as string | null | undefined,
    captureGroupId: text(input.captureGroupId, 'captureGroupId', 0, 160, { optional: true, nullable: true, pattern: /^[A-Za-z0-9_-]+$/ }) as string | null | undefined,
    requestedEvidenceCount: numberValue(input.requestedEvidenceCount, 'requestedEvidenceCount', 1, 24, { optional: true, defaultValue: 1, integer: true }) as number,
  };
});

export const uploadRequestSchema = schema((value) => {
  const input = object(value);
  const manifest = input.manifest !== undefined && input.manifest !== null
    ? captureManifestInputSchema.parse(input.manifest)
    : null;
  const evidenceType = enumValue(input.evidenceType, 'evidenceType', evidenceTypes) as EvidenceType;
  const contentType = text(input.contentType, 'contentType', 1, 100, {
    pattern: /^(image\/(jpeg|png)|video\/mp4|application\/pdf)$/,
  }) as string;
  const expectedContentTypes = evidenceType.includes('VIDEO')
    ? ['video/mp4']
    : evidenceType === 'SUPPORTING_DOCUMENT'
      ? ['application/pdf']
      : ['image/jpeg', 'image/png'];
  if (!expectedContentTypes.includes(contentType)) {
    throw new ValidationError('contentType', `is not allowed for evidence type ${evidenceType}`);
  }
  return {
    transactionId: transactionId(input.transactionId),
    evidenceType,
    contentType,
    originalName: text(input.originalName, 'originalName', 1, 180, { pattern: /^[^\u0000-\u001f\u007f]+$/ }) as string,
    clientEvidenceId: text(input.clientEvidenceId, 'clientEvidenceId', 10, 160, { optional: true, pattern: /^[A-Za-z0-9_-]+$/ }) as string | undefined,
    clientCreatedAt: isoDate(input.clientCreatedAt, 'clientCreatedAt', { optional: true }) as string | undefined,
    clientSha256: text(input.clientSha256, 'clientSha256', 64, 64, { optional: true, pattern: /^[a-f0-9]{64}$/i }) as string | undefined,
    clientSizeBytes: numberValue(input.clientSizeBytes, 'clientSizeBytes', 1, 600 * 1024 * 1024, { optional: true, integer: true, positive: true }) as number | undefined,
    captureSessionId: optionalId(input.captureSessionId, 'captureSessionId'),
    returnPassportId: optionalId(input.returnPassportId, 'returnPassportId'),
    connectSessionId: optionalId(input.connectSessionId, 'connectSessionId'),
    manifest,
  };
});

export const shippingSchema = schema((value) => {
  const input = object(value);
  return { transactionId: transactionId(input.transactionId), carrier: text(input.carrier, 'carrier', 1, 80) as string, trackingNumber: text(input.trackingNumber, 'trackingNumber', 3, 120) as string };
});

export const returnPassportSchema = schema((value) => {
  const input = object(value);
  return { transactionId: transactionId(input.transactionId), reason: text(input.reason, 'reason', 5, 2000) as string };
});

export const returnPassportIdSchema = schema((value) => {
  const input = object(value);
  return { transactionId: transactionId(input.transactionId), returnPassportId: text(input.returnPassportId, 'returnPassportId', 8, 160) as string };
});

export const returnShippingSchema = schema((value) => {
  const base = returnPassportIdSchema.parse(value);
  const input = object(value);
  return { ...base, carrier: text(input.carrier, 'carrier', 1, 80) as string, trackingNumber: text(input.trackingNumber, 'trackingNumber', 3, 120) as string };
});

export const reportSchema = schema((value) => {
  const input = object(value);
  return {
    transactionId: transactionId(input.transactionId),
    targetUserId: text(input.targetUserId, 'targetUserId', 1, 128, { optional: true }) as string | undefined,
    evidenceId: text(input.evidenceId, 'evidenceId', 1, 128, { optional: true }) as string | undefined,
    reason: enumValue(input.reason, 'reason', ['FRAUD', 'HARASSMENT', 'PROHIBITED_ITEM', 'IMPERSONATION', 'PRIVACY', 'OTHER'] as const),
    details: text(input.details, 'details', 5, 2000) as string,
  };
});

export const connectOrderSchema = schema((value) => {
  const input = object(value);
  return {
    platform: text(input.platform, 'platform', 2, 80) as string,
    orderId: text(input.orderId, 'orderId', 1, 200) as string,
    sellerId: text(input.sellerId, 'sellerId', 1, 200) as string,
    trackingNumber: text(input.trackingNumber, 'trackingNumber', 3, 120, { optional: true }) as string | undefined,
    carrier: text(input.carrier, 'carrier', 1, 80, { optional: true }) as string | undefined,
    itemTitle: text(input.itemTitle, 'itemTitle', 1, 300) as string,
    itemDescription: text(input.itemDescription, 'itemDescription', 0, 3000, { defaultValue: '' }) as string,
    declaredWeightGrams: numberValue(input.declaredWeightGrams, 'declaredWeightGrams', 0, 2_000_000, { optional: true, integer: true }) as number | undefined,
    priceMinor: numberValue(input.priceMinor, 'priceMinor', 0, 10_000_000_000, { defaultValue: 0, integer: true }) as number,
    currency: text(input.currency ?? 'USD', 'currency', 3, 3, { pattern: /^[A-Z]{3}$/ }) as string,
    callbackUrl: urlText(input.callbackUrl, 'callbackUrl'),
    idempotencyKey: text(input.idempotencyKey, 'idempotencyKey', 8, 200) as string,
  };
});

export const redeemConnectSchema = schema((value) => {
  const input = object(value);
  return {
    sessionId: text(input.sessionId, 'sessionId', 8, 160) as string,
    token: text(input.token, 'token', 20, 300) as string,
    clientId: text(input.clientId, 'clientId', 8, 160, { optional: true }) as string | undefined,
    redirectUri: input.redirectUri === undefined ? undefined : urlText(input.redirectUri, 'redirectUri'),
    codeVerifier: text(input.codeVerifier, 'codeVerifier', 43, 128, { optional: true }) as string | undefined,
  };
});

export const redeemPublicCommerceHandoffSchema = schema((value) => {
  const input = object(value);
  return {
    handoffId: text(input.handoffId, 'handoffId', 44, 44, { pattern: /^hnd_[a-f0-9]{40}$/ }) as string,
    token: text(input.token, 'token', 20, 300) as string,
  };
});

export const connectProvisionSchema = schema((value) => {
  const input = object(value);
  if (!Array.isArray(input.callbackOrigins) || input.callbackOrigins.length < 1 || input.callbackOrigins.length > 10) {
    throw new ValidationError('callbackOrigins', 'must contain 1-10 URL origins');
  }
  const rawButtonOrigins = input.buttonOrigins ?? input.callbackOrigins;
  if (!Array.isArray(rawButtonOrigins) || rawButtonOrigins.length < 1 || rawButtonOrigins.length > 100) {
    throw new ValidationError('buttonOrigins', 'must contain 1-100 URL origins');
  }
  return {
    name: text(input.name, 'name', 2, 120) as string,
    platform: text(input.platform, 'platform', 2, 80) as string,
    callbackOrigins: input.callbackOrigins.map((origin, index) => urlText(origin, `callbackOrigins[${index}]`, 500)),
    buttonOrigins: rawButtonOrigins.map((origin, index) => urlText(origin, `buttonOrigins[${index}]`, 500)),
    environment: enumValue(input.environment, 'environment', ['SANDBOX', 'PRODUCTION'] as const, 'SANDBOX'),
  };
});
