import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import {
  edgeQueueFolderForTransport,
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

export class EncryptedEdgeQueue {
  private readonly records = new Map<string, EncryptedSpoolRecord>();

  constructor(private readonly key: Buffer) {
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
    const existing = this.records.get(clientEvidenceId);
    if (existing) return existing;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(clientEvidenceId));
    const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
    const record: EncryptedSpoolRecord = {
      clientEvidenceId,
      fulfillmentSessionId: input.fulfillmentSessionId,
      artifactType: input.artifactType,
      folder: 'pending',
      acquisitionAssurance: input.onlineAtCapture ? 'ONLINE_ASSURED' : 'OFFLINE_CAPTURED',
      transportState: 'PENDING',
      plaintextSha256: input.plaintextSha256,
      sizeBytes: input.plaintext.length,
      iv: iv.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
    };
    this.records.set(clientEvidenceId, record);
    return record;
  }

  decrypt(clientEvidenceId: string): Buffer {
    const record = this.require(clientEvidenceId);
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(record.iv, 'base64url'));
    decipher.setAAD(Buffer.from(clientEvidenceId));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]);
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
    return [...this.records.values()].filter((record) => folder === undefined || record.folder === folder);
  }

  label(clientEvidenceId: string): ReturnType<typeof syncLabelForQueueObject> {
    return syncLabelForQueueObject(this.require(clientEvidenceId));
  }

  private move(clientEvidenceId: string, to: EdgeTransportState): EncryptedSpoolRecord {
    const record = this.require(clientEvidenceId);
    assertTransition(record.transportState, to);
    const next: EncryptedSpoolRecord = {
      ...record,
      transportState: to,
      folder: edgeQueueFolderForTransport[to],
    };
    this.records.set(clientEvidenceId, next);
    return next;
  }

  private require(clientEvidenceId: string): EncryptedSpoolRecord {
    const record = this.records.get(clientEvidenceId);
    if (!record) throw new Error(`Edge queue object ${clientEvidenceId} was not found.`);
    return record;
  }
}

export function createSoftwareWrappedSpoolKey(): Buffer {
  return randomBytes(32);
}

export type { EdgeAcquisitionAssurance };
