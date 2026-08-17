import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { edgeQueueFolderForTransport, type EdgeTransportState } from '../../domain/v1/edge-protocol';
import {
  EncryptedEdgeQueue,
  edgeSpoolMetadataMac,
  type EncryptedSpoolRecord,
  type EdgeSpoolStore,
} from './queue';

export interface EdgeKeyStore {
  loadOrCreate(): Buffer;
}

export class FileBackedSoftwareKeyStore implements EdgeKeyStore {
  constructor(private readonly keyPath: string) {}

  loadOrCreate(): Buffer {
    try {
      const existing = fs.readFileSync(this.keyPath);
      if (existing.length === 32) return existing;
    } catch {
      // create below
    }
    const key = randomBytes(32);
    atomicWriteFile(this.keyPath, key);
    return key;
  }
}

type DurableMetadataRow = Omit<EncryptedSpoolRecord, 'ciphertext'> & {
  artifactRelPath: string;
};

function atomicWriteFile(filePath: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.rmSync(filePath, { force: true });
    fs.renameSync(tmp, filePath);
  }
}

function tryOpenSqlite(filePath: string): SqliteHandle | null {
  try {
    // node:sqlite is available on Node 22 without a native addon.
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string) => {
        exec(sql: string): void;
        prepare(sql: string): {
          run: (...params: unknown[]) => void;
          all: (...params: unknown[]) => Record<string, unknown>[];
          get: (...params: unknown[]) => Record<string, unknown> | undefined;
        };
      };
    };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const db = new DatabaseSync(filePath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = FULL;');
    db.exec(`
      CREATE TABLE IF NOT EXISTS spool_metadata (
        client_evidence_id TEXT PRIMARY KEY,
        fulfillment_session_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        folder TEXT NOT NULL,
        acquisition_assurance TEXT NOT NULL,
        transport_state TEXT NOT NULL,
        plaintext_sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        metadata_mac TEXT NOT NULL,
        artifact_rel_path TEXT NOT NULL
      );
    `);
    return { kind: 'sqlite', db };
  } catch {
    return null;
  }
}

type SqliteHandle = {
  kind: 'sqlite';
  db: {
    exec(sql: string): void;
    prepare(sql: string): {
      run: (...params: unknown[]) => void;
      all: (...params: unknown[]) => Record<string, unknown>[];
      get: (...params: unknown[]) => Record<string, unknown> | undefined;
    };
  };
};

export class DurableEdgeSpoolStore implements EdgeSpoolStore {
  readonly backend: 'sqlite' | 'json';
  private readonly sqlite: SqliteHandle | null;
  private readonly metadataPath: string;
  private readonly artifactsDir: string;

  constructor(private readonly root: string, private readonly key: Buffer) {
    fs.mkdirSync(root, { recursive: true });
    this.artifactsDir = path.join(root, 'artifacts');
    fs.mkdirSync(this.artifactsDir, { recursive: true });
    this.metadataPath = path.join(root, 'metadata.json');
    this.sqlite = tryOpenSqlite(path.join(root, 'spool.sqlite'));
    this.backend = this.sqlite ? 'sqlite' : 'json';
    this.reconcile();
  }

  get(clientEvidenceId: string): EncryptedSpoolRecord | null {
    const row = this.readRow(clientEvidenceId);
    if (!row) return null;
    return this.hydrate(row);
  }

  put(record: EncryptedSpoolRecord): void {
    const artifactRelPath = path.posix.join('artifacts', `${record.clientEvidenceId}.bin`);
    const artifactPath = path.join(this.root, artifactRelPath);
    const blob = Buffer.concat([
      Buffer.from(record.iv, 'base64url'),
      Buffer.from(record.authTag, 'base64url'),
      Buffer.from(record.ciphertext, 'base64url'),
    ]);
    atomicWriteFile(artifactPath, blob);
    const row: DurableMetadataRow = {
      clientEvidenceId: record.clientEvidenceId,
      fulfillmentSessionId: record.fulfillmentSessionId,
      artifactType: record.artifactType,
      folder: record.folder,
      acquisitionAssurance: record.acquisitionAssurance,
      transportState: record.transportState,
      plaintextSha256: record.plaintextSha256,
      sizeBytes: record.sizeBytes,
      iv: record.iv,
      authTag: record.authTag,
      metadataMac: record.metadataMac,
      artifactRelPath,
    };
    this.writeRow(row);
  }

  list(): EncryptedSpoolRecord[] {
    return this.readAllRows().map((row) => this.hydrate(row));
  }

  reconcile(): { resetToPending: string[]; missingFiles: string[]; orphanFiles: string[] } {
    const resetToPending: string[] = [];
    const missingFiles: string[] = [];
    const rows = this.readAllRows();
    for (const row of rows) {
      const artifactPath = path.join(this.root, row.artifactRelPath);
      if (!fs.existsSync(artifactPath)) {
        missingFiles.push(row.clientEvidenceId);
        const unsigned = {
          clientEvidenceId: row.clientEvidenceId,
          fulfillmentSessionId: row.fulfillmentSessionId,
          artifactType: row.artifactType,
          folder: 'attention' as const,
          acquisitionAssurance: row.acquisitionAssurance,
          transportState: 'ATTENTION' as const,
          plaintextSha256: row.plaintextSha256,
          sizeBytes: row.sizeBytes,
          iv: row.iv,
          ciphertext: '',
          authTag: row.authTag,
        };
        this.writeRow({
          ...row,
          transportState: 'ATTENTION',
          folder: 'attention',
          metadataMac: edgeSpoolMetadataMac(this.key, unsigned),
        });
        continue;
      }
      if (row.transportState === 'UPLOADING') {
        const nextState: EdgeTransportState = 'PENDING';
        const next = {
          ...row,
          transportState: nextState,
          folder: edgeQueueFolderForTransport[nextState],
        };
        this.writeRow({
          ...next,
          metadataMac: edgeSpoolMetadataMac(this.key, { ...this.hydrate(row), transportState: nextState, folder: next.folder }),
        });
        resetToPending.push(row.clientEvidenceId);
      }
    }
    const known = new Set(rows.map((row) => path.basename(row.artifactRelPath)));
    const orphanFiles: string[] = [];
    for (const name of fs.readdirSync(this.artifactsDir)) {
      if (!name.endsWith('.bin')) continue;
      if (!known.has(name)) orphanFiles.push(name);
    }
    return { resetToPending, missingFiles, orphanFiles };
  }

  private hydrate(row: DurableMetadataRow): EncryptedSpoolRecord {
    const artifactPath = path.join(this.root, row.artifactRelPath);
    const blob = fs.readFileSync(artifactPath);
    const ivBytes = Buffer.from(row.iv, 'base64url');
    const tagBytes = Buffer.from(row.authTag, 'base64url');
    const ciphertext = blob.subarray(ivBytes.length + tagBytes.length);
    return {
      clientEvidenceId: row.clientEvidenceId,
      fulfillmentSessionId: row.fulfillmentSessionId,
      artifactType: row.artifactType,
      folder: row.folder,
      acquisitionAssurance: row.acquisitionAssurance,
      transportState: row.transportState,
      plaintextSha256: row.plaintextSha256,
      sizeBytes: row.sizeBytes,
      iv: row.iv,
      authTag: row.authTag,
      ciphertext: ciphertext.toString('base64url'),
      metadataMac: row.metadataMac,
    };
  }

  private readRow(clientEvidenceId: string): DurableMetadataRow | null {
    if (this.sqlite) {
      const row = this.sqlite.db.prepare('SELECT * FROM spool_metadata WHERE client_evidence_id = ?').get(clientEvidenceId);
      return row ? this.fromSqlite(row) : null;
    }
    return this.readJson().find((item) => item.clientEvidenceId === clientEvidenceId) ?? null;
  }

  private readAllRows(): DurableMetadataRow[] {
    if (this.sqlite) {
      return this.sqlite.db.prepare('SELECT * FROM spool_metadata').all().map((row) => this.fromSqlite(row));
    }
    return this.readJson();
  }

  private writeRow(row: DurableMetadataRow): void {
    if (this.sqlite) {
      this.sqlite.db.prepare(`
        INSERT INTO spool_metadata (
          client_evidence_id, fulfillment_session_id, artifact_type, folder, acquisition_assurance,
          transport_state, plaintext_sha256, size_bytes, iv, auth_tag, metadata_mac, artifact_rel_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_evidence_id) DO UPDATE SET
          folder = excluded.folder,
          transport_state = excluded.transport_state,
          metadata_mac = excluded.metadata_mac,
          artifact_rel_path = excluded.artifact_rel_path
      `).run(
        row.clientEvidenceId, row.fulfillmentSessionId, row.artifactType, row.folder, row.acquisitionAssurance,
        row.transportState, row.plaintextSha256, row.sizeBytes, row.iv, row.authTag, row.metadataMac, row.artifactRelPath,
      );
      return;
    }
    const rows = this.readJson().filter((item) => item.clientEvidenceId !== row.clientEvidenceId);
    rows.push(row);
    atomicWriteFile(this.metadataPath, JSON.stringify({ schemaVersion: 1, records: rows }, null, 2));
  }

  private readJson(): DurableMetadataRow[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8')) as { records?: DurableMetadataRow[] };
      return parsed.records ?? [];
    } catch {
      return [];
    }
  }

  private fromSqlite(row: Record<string, unknown>): DurableMetadataRow {
    return {
      clientEvidenceId: String(row.client_evidence_id),
      fulfillmentSessionId: String(row.fulfillment_session_id),
      artifactType: String(row.artifact_type),
      folder: row.folder as DurableMetadataRow['folder'],
      acquisitionAssurance: row.acquisition_assurance as DurableMetadataRow['acquisitionAssurance'],
      transportState: row.transport_state as DurableMetadataRow['transportState'],
      plaintextSha256: String(row.plaintext_sha256),
      sizeBytes: Number(row.size_bytes),
      iv: String(row.iv),
      authTag: String(row.auth_tag),
      metadataMac: String(row.metadata_mac),
      artifactRelPath: String(row.artifact_rel_path),
    };
  }
}

export function openDurableEncryptedEdgeQueue(root: string, keyStore: EdgeKeyStore): {
  queue: EncryptedEdgeQueue;
  store: DurableEdgeSpoolStore;
  key: Buffer;
} {
  const key = keyStore.loadOrCreate();
  const store = new DurableEdgeSpoolStore(root, key);
  return { queue: new EncryptedEdgeQueue(key, store), store, key };
}

export function spoolArtifactDigest(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
