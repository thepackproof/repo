import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  edgeQueueFolderForTransport,
  edgeSpoolAad,
  syncLabelForQueueObject,
  uploadSuccessIsServerFinalization,
  type EdgeAcquisitionAssurance,
  type EdgeQueueFolder,
  type EdgeQueueObject,
  type EdgeTransportState,
} from '../../domain/v1/edge-protocol';

export type EncryptedSpoolRecord = EdgeQueueObject & {
  iv: string;
  ciphertext: string;
  authTag: string;
  metadataMac: string;
};

function assertTransition(from: EdgeTransportState, to: EdgeTransportState): void {
  const allowed: Record<EdgeTransportState, readonly EdgeTransportState[]> = {
    PENDING: ['UPLOADING', 'ATTENTION'],
    UPLOADING: ['AWAITING_FINALIZATION', 'PENDING', 'ATTENTION'],
    AWAITING_FINALIZATION: ['SERVER_FINALIZED', 'ATTENTION'],
    SERVER_FINALIZED: [],
    ATTENTION: ['PENDING', 'UPLOADING'],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Edge queue cannot move from ${from} to ${to}`);
  }
}

export function edgeSpoolMetadataMac(key: Buffer, record: Omit<EncryptedSpoolRecord, 'metadataMac'>): string {
  return createHmac('sha256', key).update([
    'packproof-edge-spool-meta-v1',
    record.clientEvidenceId,
    record.fulfillmentSessionId,
    record.artifactType,
    record.folder,
    record.acquisitionAssurance,
    record.transportState,
    record.plaintextSha256,
    String(record.sizeBytes),
    record.iv,
    record.authTag,
  ].join('\n')).digest('base64url');
}

export function encryptEdgeSpool(key: Buffer, plaintext: Buffer, aad: Buffer): { iv: string; ciphertext: string; authTag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptEdgeSpool(key: Buffer, record: Pick<EncryptedSpoolRecord, 'iv' | 'ciphertext' | 'authTag'>, aad: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64url'));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]);
}

export interface EdgeSpoolStore {
  get(clientEvidenceId: string): EncryptedSpoolRecord | null;
  put(record: EncryptedSpoolRecord): void;
  list(): EncryptedSpoolRecord[];
}

export class MemoryEdgeSpoolStore implements EdgeSpoolStore {
  private readonly records = new Map<string, EncryptedSpoolRecord>();

  get(clientEvidenceId: string): EncryptedSpoolRecord | null {
    return this.records.get(clientEvidenceId) ?? null;
  }

  put(record: EncryptedSpoolRecord): void {
    this.records.set(record.clientEvidenceId, record);
  }

  list(): EncryptedSpoolRecord[] {
    return [...this.records.values()];
  }
}

export class EncryptedEdgeQueue {
  constructor(
    private readonly key: Buffer,
    private readonly store: EdgeSpoolStore = new MemoryEdgeSpoolStore(),
  ) {
    if (key.length !== 32) throw new Error('Edge spool key must be 32 bytes.');
  }

  enqueue(input: {
    fulfillmentSessionId: string;
    artifactType: string;
    plaintext: Buffer;
    plaintextSha256: string;
    onlineAtCapture: boolean;
    clientEvidenceId?: string;
  }): EncryptedSpoolRecord {
    const clientEvidenceId = input.clientEvidenceId ?? randomUUID();
    const existing = this.store.get(clientEvidenceId);
    if (existing) {
      this.assertMetadataMac(existing);
      return existing;
    }
    const acquisitionAssurance: EdgeAcquisitionAssurance = input.onlineAtCapture ? 'ONLINE_ASSURED' : 'OFFLINE_CAPTURED';
    const aad = edgeSpoolAad({
      clientEvidenceId,
      fulfillmentSessionId: input.fulfillmentSessionId,
      artifactType: input.artifactType,
      plaintextSha256: input.plaintextSha256,
      sizeBytes: input.plaintext.length,
      acquisitionAssurance,
    });
    const encrypted = encryptEdgeSpool(this.key, input.plaintext, aad);
    const unsigned: Omit<EncryptedSpoolRecord, 'metadataMac'> = {
      clientEvidenceId,
      fulfillmentSessionId: input.fulfillmentSessionId,
      artifactType: input.artifactType,
      folder: 'pending',
      acquisitionAssurance,
      transportState: 'PENDING',
      plaintextSha256: input.plaintextSha256,
      sizeBytes: input.plaintext.length,
      iv: encrypted.iv,
      ciphertext: encrypted.ciphertext,
      authTag: encrypted.authTag,
    };
    const record: EncryptedSpoolRecord = {
      ...unsigned,
      metadataMac: edgeSpoolMetadataMac(this.key, unsigned),
    };
    this.store.put(record);
    return record;
  }

  decrypt(clientEvidenceId: string): Buffer {
    const record = this.require(clientEvidenceId);
    const aad = edgeSpoolAad(record);
    return decryptEdgeSpool(this.key, record, aad);
  }

  markUploading(clientEvidenceId: string): EncryptedSpoolRecord {
    return this.move(clientEvidenceId, 'UPLOADING');
  }

  markUploaded(clientEvidenceId: string): EncryptedSpoolRecord {
    if (uploadSuccessIsServerFinalization()) {
      throw new Error('A successful Edge upload is not server finalization.');
    }
    return this.move(clientEvidenceId, 'AWAITING_FINALIZATION');
  }

  markServerFinalized(clientEvidenceId: string): EncryptedSpoolRecord {
    return this.move(clientEvidenceId, 'SERVER_FINALIZED');
  }

  markAttention(clientEvidenceId: string): EncryptedSpoolRecord {
    return this.move(clientEvidenceId, 'ATTENTION');
  }

  retryFromAttention(clientEvidenceId: string): EncryptedSpoolRecord {
    return this.move(clientEvidenceId, 'PENDING');
  }

  list(folder?: EdgeQueueFolder): EncryptedSpoolRecord[] {
    return this.store.list().filter((record) => folder === undefined || record.folder === folder);
  }

  label(clientEvidenceId: string): ReturnType<typeof syncLabelForQueueObject> {
    return syncLabelForQueueObject(this.require(clientEvidenceId));
  }

  private move(clientEvidenceId: string, to: EdgeTransportState): EncryptedSpoolRecord {
    const record = this.require(clientEvidenceId);
    assertTransition(record.transportState, to);
    const unsigned: Omit<EncryptedSpoolRecord, 'metadataMac'> = {
      ...record,
      transportState: to,
      folder: edgeQueueFolderForTransport[to],
    };
    const next: EncryptedSpoolRecord = {
      ...unsigned,
      metadataMac: edgeSpoolMetadataMac(this.key, unsigned),
    };
    this.store.put(next);
    return next;
  }

  private require(clientEvidenceId: string): EncryptedSpoolRecord {
    const record = this.store.get(clientEvidenceId);
    if (!record) throw new Error(`Edge queue object ${clientEvidenceId} was not found.`);
    this.assertMetadataMac(record);
    return record;
  }

  private assertMetadataMac(record: EncryptedSpoolRecord): void {
    const expected = edgeSpoolMetadataMac(this.key, record);
    if (expected !== record.metadataMac) {
      throw new Error(`Edge spool metadata MAC mismatch for ${record.clientEvidenceId}.`);
    }
  }
}

export function createSoftwareWrappedSpoolKey(): Buffer {
  return randomBytes(32);
}

export type { EdgeAcquisitionAssurance };
