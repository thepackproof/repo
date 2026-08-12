import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { deleteFile, decryptFile, encryptFile } from 'packproof-secure-file';
import { EvidenceFinalizationPendingError, uploadQueuedEvidence } from '@/lib/api';
import { auth } from '@/lib/firebase';
import type { EvidenceType } from '@/types/models';
import type { CaptureManifestInput } from '@/types/telemetry';

const INDEX_KEY = '@packproof/offline-evidence/index-v1';
const QUEUE_DIR = `${FileSystem.documentDirectory}packproof-secure-queue/`;
const TEMP_DIR = `${FileSystem.cacheDirectory}packproof-queue-temp/`;

export type QueuedEvidence = {
  id: string;
  uploaderId: string;
  transactionId: string;
  evidenceType: EvidenceType;
  contentType: string;
  originalName: string;
  encryptedMediaUri: string;
  encryptedMetadataUri: string;
  localSha256: string;
  plaintextSizeBytes: number;
  encryption: 'ANDROID_KEYSTORE_AES_256_GCM';
  encryptionContainerVersion: number;
  encryptionHeaderAuthenticated: boolean;
  clientCreatedAt: string;
  manifest: CaptureManifestInput | null;
  captureSessionId: string | null;
  returnPassportId: string | null;
  connectSessionId: string | null;
  state: QueueState;
  stateChangedAt: string;
  stateHistory: { state: QueueState; at: string; reason: string | null }[];
  uploadId: string | null;
  storagePath: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastErrorClass: 'RETRYABLE' | 'TERMINAL' | null;
  createdAt: string;
};

export type QueueState =
  | 'ENCRYPTING'
  | 'QUEUED'
  | 'DECRYPTING_FOR_UPLOAD'
  | 'GRANT_REQUESTED'
  | 'UPLOADING'
  | 'AWAITING_FINALIZATION'
  | 'FINALIZED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_TERMINAL';

type EnqueueInput = {
  uploaderId: string;
  transactionId: string;
  evidenceType: EvidenceType;
  localUri: string;
  contentType: string;
  originalName: string;
  manifest?: CaptureManifestInput | null;
  captureSessionId?: string | null;
  returnPassportId?: string | null;
  connectSessionId?: string | null;
};

export type QueueSyncResult = {
  uploadedIds: string[];
  pendingIds: string[];
  failedIds: string[];
  terminalIds: string[];
};

export type QueueStatus = { queuedCount: number; attentionCount: number };

let syncPromise: Promise<QueueSyncResult> | null = null;
const listeners = new Set<() => void>();

function uriFor(name: string): string {
  return `${QUEUE_DIR}${name}`;
}

function tempUriFor(name: string): string {
  return `${TEMP_DIR}${name}`;
}

async function ensureDirectories(): Promise<void> {
  await Promise.all([
    FileSystem.makeDirectoryAsync(QUEUE_DIR, { intermediates: true }),
    FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true }),
  ]);
}

async function getIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

async function setIndex(ids: string[]): Promise<void> {
  const unique = Array.from(new Set(ids));
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(unique));
  listeners.forEach((listener) => listener());
}

function emitQueueChanged(): void {
  listeners.forEach((listener) => listener());
}

async function writeEncryptedMetadata(item: QueuedEvidence): Promise<void> {
  await ensureDirectories();
  const plaintextUri = tempUriFor(`${item.id}.json`);
  await FileSystem.writeAsStringAsync(plaintextUri, JSON.stringify(item), { encoding: FileSystem.EncodingType.UTF8 });
  try {
    await encryptFile(plaintextUri, item.encryptedMetadataUri);
  } finally {
    await FileSystem.deleteAsync(plaintextUri, { idempotent: true });
  }
}

function normalizeItem(item: QueuedEvidence): QueuedEvidence {
  const createdAt = typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString();
  const state = item.state ?? 'QUEUED';
  return {
    ...item,
    state,
    stateChangedAt: item.stateChangedAt ?? createdAt,
    stateHistory: Array.isArray(item.stateHistory) && item.stateHistory.length
      ? item.stateHistory.slice(-40)
      : [{ state, at: item.stateChangedAt ?? createdAt, reason: 'MIGRATED_FROM_QUEUE_V1' }],
    uploadId: item.uploadId ?? null,
    storagePath: item.storagePath ?? null,
    encryptionContainerVersion: item.encryptionContainerVersion ?? 1,
    encryptionHeaderAuthenticated: item.encryptionHeaderAuthenticated ?? false,
    lastErrorClass: item.lastErrorClass ?? null,
  };
}

async function transition(item: QueuedEvidence, state: QueueState, reason: string | null = null): Promise<void> {
  const at = new Date().toISOString();
  item.state = state;
  item.stateChangedAt = at;
  item.stateHistory = [...item.stateHistory, { state, at, reason }].slice(-40);
  await writeEncryptedMetadata(item);
  emitQueueChanged();
}

async function readEncryptedMetadata(id: string): Promise<QueuedEvidence | null> {
  const encryptedMetadataUri = uriFor(`${id}.meta.ppq`);
  const plaintextUri = tempUriFor(`${id}.read.json`);
  try {
    await decryptFile(encryptedMetadataUri, plaintextUri);
    const raw = await FileSystem.readAsStringAsync(plaintextUri, { encoding: FileSystem.EncodingType.UTF8 });
    const item = normalizeItem(JSON.parse(raw) as QueuedEvidence);
    return item.id === id && typeof item.uploaderId === 'string' ? item : null;
  } catch {
    return null;
  } finally {
    await FileSystem.deleteAsync(plaintextUri, { idempotent: true });
  }
}

async function removeItem(item: QueuedEvidence): Promise<void> {
  await Promise.allSettled([
    deleteFile(item.encryptedMediaUri),
    deleteFile(item.encryptedMetadataUri),
  ]);
  const ids = await getIndex();
  await setIndex(ids.filter((id) => id !== item.id));
}

export async function enqueueEvidence(input: EnqueueInput): Promise<QueuedEvidence> {
  if (Platform.OS !== 'android') {
    throw new Error('The encrypted offline evidence queue currently requires the Android production build.');
  }
  await ensureDirectories();
  const id = `qe_${Crypto.randomUUID().replaceAll('-', '')}`;
  const encryptionStartedAt = new Date().toISOString();
  const encryptedMediaUri = uriFor(`${id}.media.ppq`);
  const encryptedMetadataUri = uriFor(`${id}.meta.ppq`);
  const encrypted = await encryptFile(input.localUri, encryptedMediaUri);
  const item: QueuedEvidence = {
    id,
    uploaderId: input.uploaderId,
    transactionId: input.transactionId,
    evidenceType: input.evidenceType,
    contentType: input.contentType,
    originalName: input.originalName,
    encryptedMediaUri,
    encryptedMetadataUri,
    localSha256: encrypted.plaintextSha256,
    plaintextSizeBytes: encrypted.plaintextSizeBytes,
    encryption: encrypted.encryption,
    encryptionContainerVersion: encrypted.containerVersion ?? 1,
    encryptionHeaderAuthenticated: encrypted.authenticatedHeader ?? false,
    clientCreatedAt: input.manifest?.captureStartedAt ?? new Date().toISOString(),
    manifest: input.manifest ?? null,
    captureSessionId: input.captureSessionId ?? null,
    returnPassportId: input.returnPassportId ?? null,
    connectSessionId: input.connectSessionId ?? null,
    state: 'QUEUED',
    stateChangedAt: new Date().toISOString(),
    stateHistory: [
      { state: 'ENCRYPTING', at: encryptionStartedAt, reason: null },
      { state: 'QUEUED', at: new Date().toISOString(), reason: null },
    ],
    uploadId: null,
    storagePath: null,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    lastErrorClass: null,
    createdAt: new Date().toISOString(),
  };
  try {
    await writeEncryptedMetadata(item);
    const ids = await getIndex();
    await setIndex([...ids, id]);
    return item;
  } catch (error) {
    await Promise.allSettled([deleteFile(encryptedMediaUri), deleteFile(encryptedMetadataUri)]);
    throw error;
  }
}

export async function listQueuedEvidence(): Promise<QueuedEvidence[]> {
  await ensureDirectories();
  const ids = await getIndex();
  const items = await Promise.all(ids.map(readEncryptedMetadata));
  return items.filter((item): item is QueuedEvidence => Boolean(item));
}

export async function discardQueuedEvidence(id: string): Promise<void> {
  const item = await readEncryptedMetadata(id);
  if (!item) return;
  if (!['QUEUED', 'FAILED_RETRYABLE'].includes(item.state)) {
    throw new Error('This evidence has entered upload/finalization and can no longer be safely discarded.');
  }
  await removeItem(item);
}

async function readQueueSnapshot(): Promise<{ items: QueuedEvidence[]; unreadableIds: string[] }> {
  await ensureDirectories();
  const ids = await getIndex();
  const read = await Promise.all(ids.map(async (id) => ({ id, item: await readEncryptedMetadata(id) })));
  return {
    items: read.flatMap(({ item }) => item ? [item] : []),
    unreadableIds: read.filter(({ item }) => !item).map(({ id }) => id),
  };
}

export async function getQueuedEvidenceCount(uploaderId?: string | null): Promise<number> {
  if (!uploaderId) return 0;
  const status = await getQueuedEvidenceStatus(uploaderId);
  return status.queuedCount + status.attentionCount;
}

export async function getQueuedEvidenceStatus(uploaderId?: string | null): Promise<QueueStatus> {
  if (!uploaderId) return { queuedCount: 0, attentionCount: 0 };
  const snapshot = await readQueueSnapshot();
  const owned = snapshot.items.filter((item) => item.uploaderId === uploaderId);
  return {
    queuedCount: owned.filter((item) => item.state !== 'FAILED_TERMINAL').length,
    // An unreadable encrypted metadata container must stay visible as a local
    // queue fault. Its owner cannot be recovered without decrypting it, so the
    // signed-in user is shown the device-local attention count conservatively.
    attentionCount: owned.filter((item) => item.state === 'FAILED_TERMINAL').length + snapshot.unreadableIds.length,
  };
}

export function subscribeQueuedEvidenceStatus(uploaderId: string | null, listener: (status: QueueStatus) => void): () => void {
  let active = true;
  const emit = () => getQueuedEvidenceStatus(uploaderId)
    .then((status) => { if (active) listener(status); })
    .catch(() => { if (active) listener({ queuedCount: 0, attentionCount: 1 }); });
  listeners.add(emit);
  emit();
  return () => { active = false; listeners.delete(emit); };
}

export async function syncEvidenceQueue(options: {
  targetId?: string;
  onProgress?: (fraction: number) => void;
} = {}): Promise<QueueSyncResult> {
  if (syncPromise) {
    const activeResult = await syncPromise;
    if (!options.targetId || activeResult.uploadedIds.includes(options.targetId) || activeResult.failedIds.includes(options.targetId)) {
      return activeResult;
    }
    return syncEvidenceQueue(options);
  }
  const activeSync = (async () => {
    const network = await NetInfo.fetch();
    const snapshot = await readQueueSnapshot();
    const items = snapshot.items;
    const currentUid = auth.currentUser?.uid ?? null;
    if (!network.isConnected || network.isInternetReachable === false) {
      return {
        uploadedIds: [],
        pendingIds: [...items.map((item) => item.id), ...snapshot.unreadableIds],
        failedIds: [],
        terminalIds: [
          ...items.filter((item) => item.state === 'FAILED_TERMINAL').map((item) => item.id),
          ...snapshot.unreadableIds,
        ],
      };
    }

    const uploadedIds: string[] = [];
    const failedIds: string[] = [];
    const terminalIds = [
      ...snapshot.items.filter((item) => item.state === 'FAILED_TERMINAL').map((item) => item.id),
      ...snapshot.unreadableIds,
    ];
    const candidates = items.filter((item) => item.uploaderId === currentUid
      && item.state !== 'FAILED_TERMINAL'
      && (!options.targetId || item.id === options.targetId));
    for (const item of candidates) {
      const decryptedUri = tempUriFor(`${item.id}.upload`);
      try {
        item.attempts += 1;
        item.lastAttemptAt = new Date().toISOString();
        item.lastError = null;
        item.lastErrorClass = null;
        await transition(item, 'DECRYPTING_FOR_UPLOAD');
        await decryptFile(item.encryptedMediaUri, decryptedUri);
        const finalized = await uploadQueuedEvidence(
          item,
          decryptedUri,
          options.targetId === item.id ? options.onProgress : undefined,
          async (state) => transition(item, state),
        );
        item.uploadId = finalized.uploadId;
        item.storagePath = finalized.storagePath;
        await FileSystem.deleteAsync(decryptedUri, { idempotent: true });
        await removeItem(item);
        uploadedIds.push(item.id);
      } catch (error) {
        await FileSystem.deleteAsync(decryptedUri, { idempotent: true });
        item.lastError = error instanceof Error ? error.message.slice(0, 500) : 'Unknown queue synchronization error.';
        const terminal = isTerminalQueueError(error);
        item.lastErrorClass = terminal ? 'TERMINAL' : 'RETRYABLE';
        if (error instanceof EvidenceFinalizationPendingError) item.uploadId = error.uploadId;
        await transition(item, terminal ? 'FAILED_TERMINAL' : 'FAILED_RETRYABLE', item.lastError).catch(() => undefined);
        failedIds.push(item.id);
        if (terminal) terminalIds.push(item.id);
      }
    }
    const pendingIds = (await getIndex()).filter((id) => !uploadedIds.includes(id));
    return { uploadedIds, pendingIds, failedIds, terminalIds: Array.from(new Set(terminalIds)) };
  })().finally(() => { syncPromise = null; });
  syncPromise = activeSync;
  return activeSync;
}

function isTerminalQueueError(error: unknown): boolean {
  if (error instanceof EvidenceFinalizationPendingError) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return [
    'permission-denied',
    'invalid-argument',
    'failed-precondition',
    'different signed-in',
    'authentication tag',
    'aeadbadtagexception',
    'invalid packproof encrypted file header',
    'unsupported packproof encrypted file version',
    'truncated packproof encrypted file',
    'key permanently invalidated',
  ].some((token) => message.includes(token));
}

export function startAutomaticEvidenceSync(): () => void {
  let stopped = false;
  const attempt = () => {
    if (!stopped) syncEvidenceQueue().catch(() => undefined);
  };
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) attempt();
  });
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') attempt();
  });
  attempt();
  return () => {
    stopped = true;
    unsubscribeNetwork();
    appStateSubscription.remove();
  };
}
