import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

type EncryptionResult = {
  encryptedPath: string;
  plaintextSha256: string;
  plaintextSizeBytes: number;
  encryption: 'ANDROID_KEYSTORE_AES_256_GCM';
  containerVersion: number;
  authenticatedHeader: boolean;
};

export type DeviceKeyProof = {
  algorithm: 'SHA256withECDSA';
  keyAlias: string;
  publicKeySpkiBase64: string;
  challengeSignatureBase64: string;
  hardwareBacked: boolean;
};

export type ImageQualitySignals = {
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

type PackProofSecureFileModule = {
  encryptFile(sourceUri: string, destinationUri: string): Promise<EncryptionResult>;
  decryptFile(sourceUri: string, destinationUri: string): Promise<{ decryptedPath: string }>;
  sha256File(sourceUri: string): Promise<string>;
  analyzeImageQuality(sourceUri: string): Promise<ImageQualitySignals>;
  deleteFile(sourceUri: string): Promise<boolean>;
  signChallenge(challenge: string): Promise<DeviceKeyProof>;
};

const nativeModule = Platform.OS === 'android'
  ? requireNativeModule<PackProofSecureFileModule>('PackProofSecureFile')
  : null;

export async function encryptFile(sourceUri: string, destinationUri: string): Promise<EncryptionResult> {
  if (!nativeModule) throw new Error('Secure file encryption is currently available in the Android production build.');
  return nativeModule.encryptFile(sourceUri, destinationUri);
}

export async function decryptFile(sourceUri: string, destinationUri: string): Promise<{ decryptedPath: string }> {
  if (!nativeModule) throw new Error('Secure file decryption is currently available in the Android production build.');
  return nativeModule.decryptFile(sourceUri, destinationUri);
}

export async function sha256File(sourceUri: string): Promise<string> {
  if (!nativeModule) throw new Error('Streaming file hashing is currently available in the Android production build.');
  return nativeModule.sha256File(sourceUri);
}

export async function analyzeImageQuality(sourceUri: string): Promise<ImageQualitySignals> {
  if (!nativeModule) throw new Error('Image quality signal extraction is currently available in the Android production build.');
  return nativeModule.analyzeImageQuality(sourceUri);
}

export async function deleteFile(sourceUri: string): Promise<boolean> {
  if (!nativeModule) return false;
  return nativeModule.deleteFile(sourceUri);
}

export async function signChallenge(challenge: string): Promise<DeviceKeyProof> {
  if (!nativeModule) throw new Error('Device-key signing is currently available in the Android production build.');
  return nativeModule.signChallenge(challenge);
}
