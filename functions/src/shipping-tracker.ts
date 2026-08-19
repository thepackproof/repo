import { createHash } from 'node:crypto';
import { findTracking, getTracking, type TrackingNumber } from 'ts-tracking-number';

export const SHIPPING_OBSERVATION_INTERPRETATION = 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY' as const;

export const shippingTrackerLookupStatuses = ['DATASET_VALIDATED', 'UNRECOGNIZED', 'LOOKUP_INCOMPLETE'] as const;
export type ShippingTrackerLookupStatus = (typeof shippingTrackerLookupStatuses)[number];

export const shippingLabelStillCaptureStatuses = ['CAPTURED', 'FAILED', 'UNAVAILABLE_WHILE_RECORDING', 'NOT_ATTEMPTED'] as const;
export type ShippingLabelStillCaptureStatus = (typeof shippingLabelStillCaptureStatuses)[number];

export type ShippingTrackerObservation = {
  lookupStatus: ShippingTrackerLookupStatus;
  courierCode: string | null;
  courierName: string | null;
  publicTrackingUrl: string | null;
  stillSha256: string | null;
  stillCaptureStatus: ShippingLabelStillCaptureStatus | null;
  observationSha256: string;
  clientObservationSha256: string | null;
  hashMatched: boolean | null;
  interpretation: typeof SHIPPING_OBSERVATION_INTERPRETATION;
};

function optionalSha256(value: unknown): string | null {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
}

export function asShippingTrackerObservation(value: unknown): ShippingTrackerObservation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const observationSha256 = optionalSha256(input.observationSha256);
  if (!observationSha256) return null;
  const lookupStatus = shippingTrackerLookupStatuses.includes(input.lookupStatus as ShippingTrackerLookupStatus)
    ? input.lookupStatus as ShippingTrackerLookupStatus
    : 'LOOKUP_INCOMPLETE';
  const stillCaptureStatus = shippingLabelStillCaptureStatuses.includes(input.stillCaptureStatus as ShippingLabelStillCaptureStatus)
    ? input.stillCaptureStatus as ShippingLabelStillCaptureStatus
    : null;
  return {
    lookupStatus,
    courierCode: typeof input.courierCode === 'string' ? input.courierCode.slice(0, 20) : null,
    courierName: typeof input.courierName === 'string' ? input.courierName.slice(0, 80) : null,
    publicTrackingUrl: typeof input.publicTrackingUrl === 'string' ? input.publicTrackingUrl.slice(0, 1000) : null,
    stillSha256: optionalSha256(input.stillSha256),
    stillCaptureStatus,
    observationSha256,
    clientObservationSha256: optionalSha256(input.clientObservationSha256),
    hashMatched: typeof input.hashMatched === 'boolean' ? input.hashMatched : null,
    interpretation: SHIPPING_OBSERVATION_INTERPRETATION,
  };
}

export type ShippingObservationHashInput = {
  trackingNumber: string;
  rawDecodedValue: string;
  symbology: string;
  courierCode: string | null;
  trackerName: string | null;
  checksumValid: boolean;
  publicTrackingUrl: string | null;
  stillSha256: string | null;
};

function interpolateTrackingUrl(url: string | null | undefined, trackingNumber: string): string | null {
  if (!url) return null;
  try {
    const filled = url.replace('%s', encodeURIComponent(trackingNumber));
    return new URL(filled).toString().slice(0, 1000);
  } catch {
    return null;
  }
}

function addMatch(matches: TrackingNumber[], seen: Set<string>, item: TrackingNumber | undefined): void {
  if (!item) return;
  const key = `${item.courier.code}:${item.trackingNumber}`;
  if (seen.has(key)) return;
  seen.add(key);
  matches.push(item);
}

export function identifyTrackingNumber(rawDecodedValue: string, normalizedTrackingNumber: string) {
  try {
    const matches: TrackingNumber[] = [];
    const seen = new Set<string>();
    addMatch(matches, seen, getTracking(normalizedTrackingNumber));
    addMatch(matches, seen, getTracking(rawDecodedValue.trim()));
    for (const item of findTracking(rawDecodedValue)) addMatch(matches, seen, item);
    for (const item of findTracking(normalizedTrackingNumber)) addMatch(matches, seen, item);
    const primary = matches[0];
    if (!primary) {
      return {
        identified: false,
        checksumValid: false,
        courierCode: null as string | null,
        courierName: null as string | null,
        trackerName: null as string | null,
        publicTrackingUrl: null as string | null,
        lookupStatus: 'UNRECOGNIZED' as const,
      };
    }
    const trackingNumber = primary.trackingNumber || normalizedTrackingNumber;
    return {
      identified: true,
      checksumValid: true,
      courierCode: primary.courier.code.slice(0, 20),
      courierName: primary.courier.name.slice(0, 80),
      trackerName: primary.name.slice(0, 80),
      publicTrackingUrl: interpolateTrackingUrl(primary.trackingUrl, trackingNumber),
      lookupStatus: 'DATASET_VALIDATED' as const,
    };
  } catch {
    return {
      identified: false,
      checksumValid: false,
      courierCode: null as string | null,
      courierName: null as string | null,
      trackerName: null as string | null,
      publicTrackingUrl: null as string | null,
      lookupStatus: 'LOOKUP_INCOMPLETE' as const,
    };
  }
}

export function canonicalShippingObservationV1(input: ShippingObservationHashInput): string {
  return [
    'PACKPROOF_SHIPPING_OBSERVATION_V1',
    input.trackingNumber,
    input.rawDecodedValue,
    input.symbology,
    input.courierCode ?? '',
    input.trackerName ?? '',
    input.checksumValid ? '1' : '0',
    input.publicTrackingUrl ?? '',
    input.stillSha256 ?? '',
  ].join('\n');
}

export function hashShippingObservation(input: ShippingObservationHashInput): string {
  return createHash('sha256').update(canonicalShippingObservationV1(input), 'utf8').digest('hex');
}
