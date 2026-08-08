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
    description: text(input.description, 'description', 0, 5000, { defaultValue: '' }) as string,
    priceMinor: numberValue(input.priceMinor, 'priceMinor', 0, 10_000_000_000, { integer: true }) as number,
    currency: text(input.currency ?? 'USD', 'currency', 3, 3, { pattern: /^[A-Z]{3}$/ }) as string,
    identifiers,
    conditionNotes: text(input.conditionNotes, 'conditionNotes', 0, 5000, { defaultValue: '' }) as string,
    terms: {
      saleType: enumValue(terms.saleType, 'terms.saleType', ['SHIPPED', 'LOCAL_HANDOFF'] as const, 'SHIPPED'),
      shippingResponsibility: enumValue(terms.shippingResponsibility, 'terms.shippingResponsibility', ['SELLER', 'BUYER', 'NOT_APPLICABLE'] as const, 'SELLER'),
      returns: enumValue(terms.returns, 'terms.returns', ['NO_RETURNS', 'AS_AGREED', 'PLATFORM_POLICY'] as const, 'AS_AGREED'),
      returnWindowDays: numberValue(terms.returnWindowDays, 'terms.returnWindowDays', 0, 365, { integer: true, defaultValue: 0 }) as number,
      customTerms: text(terms.customTerms, 'terms.customTerms', 0, 5000, { defaultValue: '' }) as string,
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

function parseSensorFusion(value: unknown) {
  const input = object(value, 'manifest.sensorFusion');
  return {
    sampleWindowMs: numberValue(input.sampleWindowMs, 'manifest.sensorFusion.sampleWindowMs', 0, 30_000, { integer: true }) as number,
    accelerometerSampleCount: numberValue(input.accelerometerSampleCount, 'manifest.sensorFusion.accelerometerSampleCount', 0, 10_000, { integer: true }) as number,
    gyroscopeSampleCount: numberValue(input.gyroscopeSampleCount, 'manifest.sensorFusion.gyroscopeSampleCount', 0, 10_000, { integer: true }) as number,
    accelerometerMagnitudeMeanG: numberValue(input.accelerometerMagnitudeMeanG, 'manifest.sensorFusion.accelerometerMagnitudeMeanG', -1_000_000, 1_000_000, { nullable: true }) as number | null,
    accelerometerMagnitudeVariance: numberValue(input.accelerometerMagnitudeVariance, 'manifest.sensorFusion.accelerometerMagnitudeVariance', 0, 1_000_000, { nullable: true }) as number | null,
    gyroscopeMagnitudeVariance: numberValue(input.gyroscopeMagnitudeVariance, 'manifest.sensorFusion.gyroscopeMagnitudeVariance', 0, 1_000_000, { nullable: true }) as number | null,
    humanHoldLikely: booleanValue(input.humanHoldLikely, 'manifest.sensorFusion.humanHoldLikely', true),
    assessment: enumValue(input.assessment, 'manifest.sensorFusion.assessment', ['HANDHELD_LIKELY', 'FIXED_OR_LOW_MOTION', 'INSUFFICIENT_DATA'] as const),
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

function parseAttestation(value: unknown) {
  const input = object(value, 'manifest.attestation');
  return {
    mode: enumValue(input.mode, 'manifest.attestation.mode', ['JIT_APP_CHECK', 'OFFLINE_UNATTESTED'] as const),
    captureSessionId: text(input.captureSessionId, 'manifest.attestation.captureSessionId', 0, 160, { nullable: true, trim: false }) as string | null,
    nonce: text(input.nonce, 'manifest.attestation.nonce', 8, 256) as string,
    appId: text(input.appId, 'manifest.attestation.appId', 0, 300, { nullable: true, trim: false }) as string | null,
    issuedAt: isoDate(input.issuedAt, 'manifest.attestation.issuedAt') as string,
    captureWindowEndsAt: isoDate(input.captureWindowEndsAt, 'manifest.attestation.captureWindowEndsAt', { nullable: true }) as string | null,
    tokenReplayDetected: booleanValue(input.tokenReplayDetected, 'manifest.attestation.tokenReplayDetected', true),
    deviceKeyProof: parseDeviceKeyProof(input.deviceKeyProof),
  };
}

function parseShippingLabel(value: unknown) {
  if (value === null || value === undefined) return null;
  const input = object(value, 'manifest.shippingLabel');
  return {
    trackingNumber: text(input.trackingNumber, 'manifest.shippingLabel.trackingNumber', 8, 120, { pattern: /^[A-Z0-9]+$/ }) as string,
    symbology: text(input.symbology, 'manifest.shippingLabel.symbology', 1, 80) as string,
    detectedAt: isoDate(input.detectedAt, 'manifest.shippingLabel.detectedAt') as string,
    source: enumValue(input.source, 'manifest.shippingLabel.source', ['CAMERA_BARCODE_SCANNER'] as const),
  };
}

export const captureManifestInputSchema = schema((value) => {
  const input = object(value, 'manifest');
  if (input.schemaVersion !== 1) throw new ValidationError('manifest.schemaVersion', 'must equal 1');
  const parsed = {
    schemaVersion: 1 as const,
    captureStartedAt: isoDate(input.captureStartedAt, 'manifest.captureStartedAt') as string,
    captureFinishedAt: isoDate(input.captureFinishedAt, 'manifest.captureFinishedAt') as string,
    runtimeIntegrity: parseRuntimeIntegrity(input.runtimeIntegrity),
    sensorFusion: parseSensorFusion(input.sensorFusion),
    networkTelemetry: parseNetworkTelemetry(input.networkTelemetry),
    geolocation: parseGeolocation(input.geolocation),
    shippingLabel: parseShippingLabel(input.shippingLabel),
    attestation: parseAttestation(input.attestation),
  };
  if (JSON.stringify(parsed).length > 24_000) throw new ValidationError('manifest', 'is too large');
  return parsed;
});

export const captureSessionSchema = schema((value) => {
  const input = object(value);
  return {
    transactionId: transactionId(input.transactionId),
    returnPassportId: optionalId(input.returnPassportId, 'returnPassportId'),
    connectSessionId: optionalId(input.connectSessionId, 'connectSessionId'),
    runtimeArtifactHash: text(input.runtimeArtifactHash, 'runtimeArtifactHash', 64, 64, { optional: true, nullable: true, pattern: /^[a-f0-9]{64}$/i }) as string | null | undefined,
  };
});

export const uploadRequestSchema = schema((value) => {
  const input = object(value);
  const manifest = input.manifest !== undefined && input.manifest !== null
    ? captureManifestInputSchema.parse(input.manifest)
    : null;
  return {
    transactionId: transactionId(input.transactionId),
    evidenceType: enumValue(input.evidenceType, 'evidenceType', evidenceTypes) as EvidenceType,
    contentType: text(input.contentType, 'contentType', 1, 100, { pattern: /^(image\/[a-zA-Z0-9.+-]+|video\/[a-zA-Z0-9.+-]+|application\/pdf)$/ }) as string,
    originalName: text(input.originalName, 'originalName', 1, 180) as string,
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
  return { sessionId: text(input.sessionId, 'sessionId', 8, 160) as string, token: text(input.token, 'token', 20, 300) as string };
});

export const connectProvisionSchema = schema((value) => {
  const input = object(value);
  if (!Array.isArray(input.callbackOrigins) || input.callbackOrigins.length < 1 || input.callbackOrigins.length > 10) {
    throw new ValidationError('callbackOrigins', 'must contain 1-10 URL origins');
  }
  return {
    name: text(input.name, 'name', 2, 120) as string,
    platform: text(input.platform, 'platform', 2, 80) as string,
    callbackOrigins: input.callbackOrigins.map((origin, index) => urlText(origin, `callbackOrigins[${index}]`, 500)),
    environment: enumValue(input.environment, 'environment', ['SANDBOX', 'PRODUCTION'] as const, 'SANDBOX'),
  };
});
