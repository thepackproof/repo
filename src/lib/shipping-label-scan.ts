import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { CameraView } from 'expo-camera';
import {
  SHIPPING_OBSERVATION_DATASET,
  SHIPPING_OBSERVATION_INTERPRETATION,
  SHIPPING_OBSERVATION_PROFILE,
  canonicalShippingObservationV1,
  identifyTrackingNumber,
} from '@/lib/shipping-tracker';
import type { ShippingLabelStillTelemetry, ShippingLabelTelemetry } from '@/types/telemetry';

function decodeBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let index = 0; index < bytes.length; index += 1) hex += bytes[index].toString(16).padStart(2, '0');
  return hex;
}

export async function sha256Utf8Hex(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export async function sha256FileUri(uri: string): Promise<{ sha256: string; sizeBytes: number }> {
  const info = await FileSystem.getInfoAsync(uri);
  const sizeBytes = info.exists && typeof info.size === 'number' ? info.size : 0;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, decodeBase64ToBytes(base64));
  return { sha256: hexFromBuffer(digest), sizeBytes };
}

export async function captureShippingLabelStill(input: {
  camera: CameraView | null;
  recording: boolean;
  skipStill: boolean;
}): Promise<{ still: ShippingLabelStillTelemetry; localUri: string | null }> {
  const capturedAt = new Date().toISOString();
  const empty = (captureStatus: ShippingLabelStillTelemetry['captureStatus'], localUri: string | null = null): { still: ShippingLabelStillTelemetry; localUri: string | null } => ({
    still: { capturedAt, sha256: null, sizeBytes: null, widthPixels: null, heightPixels: null, captureStatus },
    localUri,
  });
  if (input.skipStill) return empty('NOT_ATTEMPTED');
  if (input.recording) return empty('UNAVAILABLE_WHILE_RECORDING');
  if (!input.camera) return empty('FAILED');
  try {
    const picture = await input.camera.takePictureAsync({ quality: 0.72, exif: false, shutterSound: false });
    if (!picture?.uri) return empty('FAILED');
    const hashed = await sha256FileUri(picture.uri);
    return {
      still: {
        capturedAt,
        sha256: hashed.sha256,
        sizeBytes: hashed.sizeBytes,
        widthPixels: picture.width ?? null,
        heightPixels: picture.height ?? null,
        captureStatus: 'CAPTURED',
      },
      localUri: picture.uri,
    };
  } catch {
    return empty('FAILED');
  }
}

export async function hashShippingLabelObservation(
  label: ShippingLabelTelemetry,
  still: ShippingLabelStillTelemetry,
): Promise<ShippingLabelTelemetry> {
  const identified = identifyTrackingNumber(label.rawDecodedValue, label.trackingNumber);
  const hashedAt = new Date().toISOString();
  const sha256 = await sha256Utf8Hex(canonicalShippingObservationV1({
    trackingNumber: label.trackingNumber,
    rawDecodedValue: label.rawDecodedValue,
    symbology: label.symbology,
    courierCode: identified.courierCode,
    trackerName: identified.trackerName,
    checksumValid: identified.checksumValid,
    publicTrackingUrl: identified.publicTrackingUrl,
    stillSha256: still.sha256,
  }));
  return {
    ...label,
    tracker: {
      profileId: SHIPPING_OBSERVATION_PROFILE,
      dataset: SHIPPING_OBSERVATION_DATASET,
      identified: identified.identified,
      checksumValid: identified.checksumValid,
      courierCode: identified.courierCode,
      courierName: identified.courierName,
      trackerName: identified.trackerName,
      publicTrackingUrl: identified.publicTrackingUrl,
      alternateCourierCodes: identified.alternateCourierCodes,
      lookupStatus: identified.lookupStatus,
      interpretation: SHIPPING_OBSERVATION_INTERPRETATION,
      hashedAt,
      sha256,
    },
    still,
  };
}
