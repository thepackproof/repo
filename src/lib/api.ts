import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { getDownloadURL, ref as storageRef, putFile } from '@react-native-firebase/storage';
import { auth, db, fileStorage, forceFreshAttestationToken, functions } from './firebase';
import type { QueuedEvidence } from '@/lib/offline-evidence-queue';
import type { EvidenceRecord, EvidenceType, PackProofTransaction, ReturnPassport, TimelineEvent, UserProfile } from '@/types/models';
import type { CaptureAttestation, RuntimeIntegrityTelemetry } from '@/types/telemetry';
import { signChallenge } from 'packproof-secure-file';

export async function callFunction<TInput, TOutput>(name: string, input: TInput): Promise<TOutput> {
  const callable = httpsCallable<TInput, TOutput>(functions, name);
  const result = await callable(input);
  return result.data;
}

export const ensureProfile = () => callFunction<Record<string, never>, UserProfile>('ensureUserProfile', {});

export function subscribeTransactions(uid: string, callback: (items: PackProofTransaction[]) => void, onError: (error: Error) => void): () => void {
  const q = query(collection(db, 'transactions'), where('participantIds', 'array-contains', uid), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as PackProofTransaction))), onError);
}

export function subscribeTransaction(id: string, callback: (item: PackProofTransaction | null) => void, onError: (error: Error) => void): () => void {
  return onSnapshot(doc(db, 'transactions', id), (snapshot) => callback(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as PackProofTransaction) : null), onError);
}

export function subscribeEvidence(transactionId: string, callback: (items: EvidenceRecord[]) => void): () => void {
  const q = query(collection(db, 'transactions', transactionId, 'evidence'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as EvidenceRecord))));
}

export function subscribeEvents(transactionId: string, callback: (items: TimelineEvent[]) => void): () => void {
  const q = query(collection(db, 'transactions', transactionId, 'events'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as TimelineEvent))));
}

export function subscribeReturnPassports(transactionId: string, callback: (items: ReturnPassport[]) => void): () => void {
  const q = query(collection(db, 'transactions', transactionId, 'returns'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ReturnPassport))));
}

export async function getProfile(uid: string): Promise<Pick<UserProfile, 'uid' | 'displayName' | 'photoURL'> | null> {
  const snapshot = await getDoc(doc(db, 'publicProfiles', uid));
  return snapshot.exists() ? snapshot.data() as Pick<UserProfile, 'uid' | 'displayName' | 'photoURL'> : null;
}

export async function prepareCaptureAttestation(input: {
  transactionId: string;
  returnPassportId?: string | null;
  connectSessionId?: string | null;
  runtimeIntegrity?: RuntimeIntegrityTelemetry | null;
}): Promise<CaptureAttestation> {
  await forceFreshAttestationToken();
  const payload = {
    transactionId: input.transactionId,
    returnPassportId: input.returnPassportId ?? null,
    connectSessionId: input.connectSessionId ?? null,
    runtimeArtifactHash: input.runtimeIntegrity?.runtimeArtifactHash ?? null,
  };
  const attestation = await callFunction<typeof payload, CaptureAttestation>('beginCaptureSession', payload);
  const deviceKeyProof = await signChallenge(attestation.nonce).catch(() => null);
  return { ...attestation, deviceKeyProof };
}

async function createUploadGrant(input: {
  transactionId: string;
  evidenceType: EvidenceType;
  contentType: string;
  originalName: string;
  clientCreatedAt: string;
  clientSha256?: string;
  clientSizeBytes?: number;
  captureSessionId?: string | null;
  returnPassportId?: string | null;
  connectSessionId?: string | null;
  manifest?: QueuedEvidence['manifest'];
}): Promise<{ uploadId: string; storagePath: string; status: 'READY' | 'FINALIZED'; expiresAt: string }> {
  return callFunction<typeof input, { uploadId: string; storagePath: string; status: 'READY' | 'FINALIZED'; expiresAt: string }>('requestEvidenceUpload', input);
}

export async function uploadEvidence(
  transactionId: string,
  evidenceType: EvidenceType,
  localUri: string,
  contentType: string,
  originalName: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const request = await createUploadGrant({
    transactionId,
    evidenceType,
    contentType,
    originalName,
    clientCreatedAt: new Date().toISOString(),
  });
  const task = putFile(storageRef(fileStorage, request.storagePath), localUri.replace(/^file:\/\//, ''), { contentType, cacheControl: 'private, no-store' });
  task.on('state_changed', (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0));
  await task;
}

export async function uploadQueuedEvidence(
  item: QueuedEvidence,
  decryptedUri: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  if (auth.currentUser?.uid !== item.uploaderId) {
    throw new Error('This encrypted evidence belongs to a different signed-in PackProof account.');
  }
  const request = await createUploadGrant({
    transactionId: item.transactionId,
    evidenceType: item.evidenceType,
    contentType: item.contentType,
    originalName: item.originalName,
    clientCreatedAt: item.clientCreatedAt,
    clientSha256: item.localSha256,
    clientSizeBytes: item.plaintextSizeBytes,
    captureSessionId: item.captureSessionId,
    returnPassportId: item.returnPassportId,
    connectSessionId: item.connectSessionId,
    manifest: item.manifest,
  });
  if (request.status === 'FINALIZED') return;
  const task = putFile(storageRef(fileStorage, request.storagePath), decryptedUri.replace(/^file:\/\//, ''), {
    contentType: item.contentType,
    cacheControl: 'private, no-store',
    customMetadata: {
      clientSha256: item.localSha256,
      queueId: item.id,
    },
  });
  task.on('state_changed', (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0));
  await task;
}

export async function downloadUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(fileStorage, path));
}
