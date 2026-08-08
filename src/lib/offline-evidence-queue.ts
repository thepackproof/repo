import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { deleteFile, decryptFile, encryptFile } from 'packproof-secure-file';
import { uploadQueuedEvidence } from '@/lib/api';
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
  clientCreatedAt: string;
  manifest: CaptureManifestInput | null;
  captureSessionId: string | null;
  returnPassportId: string | null;
  connectSessionId: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
};

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

type QueueSyncResult = {
  uploadedIds: string[];
  pendingIds: string[];
  failedIds: string[];
};

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

async function readEncryptedMetadata(id: string): Promise<QueuedEvidence | null> {
  const encryptedMetadataUri = uriFor(`${id}.meta.ppq`);
  const plaintextUri = tempUriFor(`${id}.read.json`);
  try {
    await decryptFile(encryptedMetadataUri, plaintextUri);
    const raw = await FileSystem.readAsStringAsync(plaintextUri, { encoding: FileSystem.EncodingType.UTF8 });
    const item = JSON.parse(raw) as QueuedEvidence;
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
  const id = `qe_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
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
    clientCreatedAt: input.manifest?.captureStartedAt ?? new Date().toISOString(),
    manifest: input.manifest ?? null,
    captureSessionId: input.captureSessionId ?? null,
    returnPassportId: input.returnPassportId ?? null,
    connectSessionId: input.connectSessionId ?? null,
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
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

export async function getQueuedEvidenceCount(uploaderId?: string | null): Promise<number> {
  if (!uploaderId) return 0;
  return (await listQueuedEvidence()).filter((item) => item.uploaderId === uploaderId).length;
}

export function subscribeQueuedEvidenceCount(uploaderId: string | null, listener: (count: number) => void): () => void {
  let active = true;
  const emit = () => getQueuedEvidenceCount(uploaderId).then((count) => { if (active) listener(count); }).catch(() => { if (active) listener(0); });
  listeners.add(emit);
  emit();
  return () => { active = false; listeners.delete(emit); };
}

export async function syncEvidenceQueue(options: {
  targetId?: string;
  onProgress?: (fraction: number) => void;
} = {}): Promise<QueueSyncResult> {
  if (syncPromise) return syncPromise;
  const activeSync = (async () => {
    const network = await NetInfo.fetch();
    const items = await listQueuedEvidence();
    const currentUid = auth.currentUser?.uid ?? null;
    if (!network.isConnected || network.isInternetReachable === false) {
      return { uploadedIds: [], pendingIds: items.map((item) => item.id), failedIds: [] };
    }

    const uploadedIds: string[] = [];
    const failedIds: string[] = [];
    const candidates = items.filter((item) => item.uploaderId === currentUid && (!options.targetId || item.id === options.targetId));
    for (const item of candidates) {
      const decryptedUri = tempUriFor(`${item.id}.upload`);
      try {
        await decryptFile(item.encryptedMediaUri, decryptedUri);
        await uploadQueuedEvidence(item, decryptedUri, options.targetId === item.id ? options.onProgress : undefined);
        await FileSystem.deleteAsync(decryptedUri, { idempotent: true });
        await removeItem(item);
        uploadedIds.push(item.id);
      } catch (error) {
        await FileSystem.deleteAsync(decryptedUri, { idempotent: true });
        item.attempts += 1;
        item.lastAttemptAt = new Date().toISOString();
        item.lastError = error instanceof Error ? error.message.slice(0, 500) : 'Unknown queue synchronization error.';
        await writeEncryptedMetadata(item).catch(() => undefined);
        failedIds.push(item.id);
      }
    }
    const pendingIds = (await getIndex()).filter((id) => !uploadedIds.includes(id));
    return { uploadedIds, pendingIds, failedIds };
  })().finally(() => { syncPromise = null; });
  syncPromise = activeSync;
  return activeSync;
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
