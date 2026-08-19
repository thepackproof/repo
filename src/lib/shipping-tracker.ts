import { findTracking, getTracking, type TrackingNumber } from 'ts-tracking-number';

export const SHIPPING_OBSERVATION_PROFILE = 'PACKPROOF_OSS_TRACKING_NUMBER_V1' as const;
export const SHIPPING_OBSERVATION_DATASET = 'jkeen/tracking_number_data via ts-tracking-number';
export const SHIPPING_OBSERVATION_INTERPRETATION = 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY' as const;

export type ShippingTrackerLookupStatus = 'DATASET_VALIDATED' | 'UNRECOGNIZED' | 'LOOKUP_INCOMPLETE';

export type TrackingIdentification = {
  identified: boolean;
  checksumValid: boolean;
  courierCode: string | null;
  courierName: string | null;
  trackerName: string | null;
  publicTrackingUrl: string | null;
  alternateCourierCodes: string[];
  lookupStatus: ShippingTrackerLookupStatus;
};

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

export function identifyTrackingNumber(rawDecodedValue: string, normalizedTrackingNumber: string): TrackingIdentification {
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
        courierCode: null,
        courierName: null,
        trackerName: null,
        publicTrackingUrl: null,
        alternateCourierCodes: [],
        lookupStatus: 'UNRECOGNIZED',
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
      alternateCourierCodes: [...new Set(matches.map((item) => item.courier.code).filter((code) => code !== primary.courier.code))].slice(0, 4),
      lookupStatus: 'DATASET_VALIDATED',
    };
  } catch {
    return {
      identified: false,
      checksumValid: false,
      courierCode: null,
      courierName: null,
      trackerName: null,
      publicTrackingUrl: null,
      alternateCourierCodes: [],
      lookupStatus: 'LOOKUP_INCOMPLETE',
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
