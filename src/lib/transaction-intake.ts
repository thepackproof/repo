import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { ConsumerIntakeSourceType, IntakeConfirmedFields, IntakePreview, PendingIntakeRecord } from '@/lib/api';
import { sha256FileUri } from '@/lib/shipping-label-scan';

export async function sha256Utf8(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

export function intakeSourceForShare(mimeType: string | null | undefined, text: string | null): ConsumerIntakeSourceType {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'SCREENSHOT_IMPORT';
  if (mime === 'application/pdf') return 'PDF_IMPORT';
  if (mime === 'message/rfc822' || (text && /^(from|subject|mime-version):/im.test(text.slice(0, 800)))) return 'EMAIL_RECEIPT';
  return 'SHARE_SHEET';
}

export async function readTextArtifact(uri: string): Promise<string | null> {
  const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }).catch(() => '');
  if (!text.trim() || text.startsWith('%PDF') || text.includes('\u0000')) return null;
  return text.slice(0, 100_000);
}

export const MAX_INTAKE_ARTIFACT_BYTES = 1_048_576;

export async function hashFileArtifact(uri: string): Promise<string> {
  const hashed = await sha256FileUri(uri);
  return hashed.sha256;
}

export async function readBinaryArtifact(uri: string): Promise<{ sha256: string; base64: string; sizeBytes: number } | null> {
  const hashed = await sha256FileUri(uri);
  if (!hashed.sizeBytes || hashed.sizeBytes > MAX_INTAKE_ARTIFACT_BYTES) return null;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return { sha256: hashed.sha256, base64, sizeBytes: hashed.sizeBytes };
}

export function confirmedFromPreview(preview: IntakePreview, extras: { title: string; variant: string; price: string; orderNumber: string }): IntakeConfirmedFields {
  const priceMinor = Math.round(Number(extras.price) * 100);
  return {
    title: extras.title.trim() || preview.title || undefined,
    variant: extras.variant.trim() || preview.variant || undefined,
    orderNumber: extras.orderNumber.trim() || preview.orderNumber || undefined,
    priceMinor: Number.isFinite(priceMinor) && extras.price.trim() ? priceMinor : preview.amount?.minorUnits,
    currency: preview.amount?.currency ?? 'USD',
  };
}

export function pendingNeedsConfirmation(item: Pick<PendingIntakeRecord, 'missingFields' | 'title' | 'amount'>): boolean {
  return !item.title.trim() || item.missingFields.includes('title') || item.missingFields.includes('price');
}

export function formatIntakeSource(value: string | null): string {
  switch (value) {
    case 'EMAIL_RECEIPT': return 'Receipt';
    case 'SHARE_SHEET': return 'Shared item';
    case 'SCREENSHOT_IMPORT': return 'Screenshot';
    case 'PDF_IMPORT': return 'PDF';
    default: return 'Imported purchase';
  }
}
