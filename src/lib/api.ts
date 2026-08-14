import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from '@react-native-firebase/firestore';
import { httpsCallable } from '@react-native-firebase/functions';
import { ref as storageRef, putFile } from '@react-native-firebase/storage';
import { auth, db, fileStorage, forceFreshAttestationToken, forceFreshCallableCredentials, functions } from './firebase';
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

export type ParticipantEvidenceSession = {
  id: string;
  object: 'evidence_session';
  transactionId: string;
  actorRole: 'SELLER' | 'BUYER' | 'RECEIVER' | 'RETURN_SENDER' | 'RETURN_RECIPIENT' | 'WITNESS';
  type: 'OUTBOUND_PACK' | 'RECEIVER_OPEN' | 'RETURN_PACK' | 'RETURN_RECEIVE' | 'PHYSICAL_REFERENCE' | 'PHYSICAL_VERIFICATION' | 'SUPPORTING_DOCUMENT';
  allowedArtifactTypes: EvidenceType[];
  status: string;
  expiresAt: string;
  requestedEvidenceCount: number;
  captureProfileId: string | null;
  captureGroupId: string | null;
};

export async function claimParticipantInvitation(claimId: string, token: string): Promise<{ transactionId: string; role: string }> {
  await forceFreshAttestationToken();
  return callFunction<{ schemaVersion: 1; claimId: string; token: string }, { transactionId: string; role: string }>(
    'claimParticipantInvitation',
    { schemaVersion: 1, claimId, token },
  );
}

export async function getMyEvidenceSession(evidenceSessionId: string): Promise<ParticipantEvidenceSession> {
  await forceFreshAttestationToken();
  return callFunction<{ evidenceSessionId: string }, ParticipantEvidenceSession>('getMyEvidenceSession', { evidenceSessionId });
}

export async function prepareEvidenceSessionAttestation(input: {
  evidenceSessionId: string;
  token: string;
  operationKey: string;
  runtimeIntegrity?: RuntimeIntegrityTelemetry | null;
}): Promise<CaptureAttestation> {
  await forceFreshAttestationToken();
  const payload = {
    schemaVersion: 1 as const,
    evidenceSessionId: input.evidenceSessionId,
    operationKey: input.operationKey,
    token: input.token,
    runtimeArtifactHash: input.runtimeIntegrity?.runtimeArtifactHash ?? null,
  };
  const result = await callFunction<typeof payload, { captureAttestation: CaptureAttestation }>('redeemEvidenceSession', payload);
  const deviceKeyProof = await signChallenge(result.captureAttestation.nonce).catch(() => null);
  return { ...result.captureAttestation, reasonCodes: result.captureAttestation.reasonCodes ?? [], deviceKeyProof };
}

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
  captureProfileId?: string | null;
  captureGroupId?: string | null;
  requestedEvidenceCount?: number;
}): Promise<CaptureAttestation> {
  await forceFreshAttestationToken();
  const payload = {
    transactionId: input.transactionId,
    returnPassportId: input.returnPassportId ?? null,
    connectSessionId: input.connectSessionId ?? null,
    runtimeArtifactHash: input.runtimeIntegrity?.runtimeArtifactHash ?? null,
    captureProfileId: input.captureProfileId ?? null,
    captureGroupId: input.captureGroupId ?? null,
    requestedEvidenceCount: input.requestedEvidenceCount ?? 1,
  };
  const attestation = await callFunction<typeof payload, CaptureAttestation>('beginCaptureSession', payload);
  const deviceKeyProof = await signChallenge(attestation.nonce).catch(() => null);
  return { ...attestation, reasonCodes: attestation.reasonCodes ?? [], deviceKeyProof };
}

async function createUploadGrant(input: {
  transactionId: string;
  evidenceType: EvidenceType;
  contentType: string;
  originalName: string;
  clientEvidenceId: string;
  clientCreatedAt: string;
  clientSha256?: string;
  clientSizeBytes?: number;
  captureSessionId?: string | null;
  returnPassportId?: string | null;
  connectSessionId?: string | null;
  manifest?: QueuedEvidence['manifest'];
}): Promise<{ uploadId: string; storagePath: string; status: 'READY' | 'PROCESSING' | 'FINALIZED'; expiresAt: string }> {
  return callFunction<typeof input, { uploadId: string; storagePath: string; status: 'READY' | 'PROCESSING' | 'FINALIZED'; expiresAt: string }>('requestEvidenceUpload', input);
}

export class EvidenceFinalizationPendingError extends Error {
  readonly retryable = true;
  constructor(readonly uploadId: string) {
    super('The original file reached PackProof storage, but server hashing and manifest finalization are still pending. The encrypted queue was retained and will check again.');
    this.name = 'EvidenceFinalizationPendingError';
  }
}

async function waitForEvidenceFinalization(transactionId: string, uploadId: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let delayMs = 500;
  while (Date.now() < deadline) {
    const snapshot = await getDoc(doc(db, 'transactions', transactionId, 'evidence', uploadId));
    if (snapshot.exists()) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(3_000, Math.round(delayMs * 1.5));
  }
  return false;
}

export async function uploadQueuedEvidence(
  item: QueuedEvidence,
  decryptedUri: string,
  onProgress?: (fraction: number) => void,
  onStateChange?: (state: 'GRANT_REQUESTED' | 'UPLOADING' | 'AWAITING_FINALIZATION' | 'FINALIZED') => void | Promise<void>,
): Promise<{ uploadId: string; storagePath: string }> {
  if (auth.currentUser?.uid !== item.uploaderId) {
    throw new Error('This encrypted evidence belongs to a different signed-in PackProof account.');
  }
  await onStateChange?.('GRANT_REQUESTED');
  const request = await createUploadGrant({
    transactionId: item.transactionId,
    evidenceType: item.evidenceType,
    contentType: item.contentType,
    originalName: item.originalName,
    clientEvidenceId: item.id,
    clientCreatedAt: item.clientCreatedAt,
    clientSha256: item.localSha256,
    clientSizeBytes: item.plaintextSizeBytes,
    captureSessionId: item.captureSessionId,
    returnPassportId: item.returnPassportId,
    connectSessionId: item.connectSessionId,
    manifest: item.manifest,
  });
  if (request.status === 'READY') {
    await onStateChange?.('UPLOADING');
    const task = putFile(storageRef(fileStorage, request.storagePath), decryptedUri.replace(/^file:\/\//, ''), {
      contentType: item.contentType,
      cacheControl: 'private, no-store',
      customMetadata: {
        clientSha256: item.localSha256,
        clientEvidenceId: item.id,
      },
    });
    task.on('state_changed', (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0));
    await task;
  }
  if (request.status !== 'FINALIZED') {
    await onStateChange?.('AWAITING_FINALIZATION');
    if (!(await waitForEvidenceFinalization(item.transactionId, request.uploadId))) {
      throw new EvidenceFinalizationPendingError(request.uploadId);
    }
  }
  await onStateChange?.('FINALIZED');
  return { uploadId: request.uploadId, storagePath: request.storagePath };
}

export async function downloadUrl(path: string): Promise<string> {
  await forceFreshCallableCredentials();
  const result = await callFunction<{ storagePath: string }, { url: string; expiresAt: string }>('createPrivateDownloadUrl', { storagePath: path });
  return result.url;
}
