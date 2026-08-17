"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DurableEdgeSpoolStore = exports.FileBackedSoftwareKeyStore = void 0;
exports.openDurableEncryptedEdgeQueue = openDurableEncryptedEdgeQueue;
exports.spoolArtifactDigest = spoolArtifactDigest;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const edge_protocol_1 = require("../../domain/v1/edge-protocol");
const queue_1 = require("./queue");
class FileBackedSoftwareKeyStore {
    keyPath;
    constructor(keyPath) {
        this.keyPath = keyPath;
    }
    loadOrCreate() {
        try {
            const existing = node_fs_1.default.readFileSync(this.keyPath);
            if (existing.length === 32)
                return existing;
        }
        catch {
            // create below
        }
        const key = (0, node_crypto_1.randomBytes)(32);
        atomicWriteFile(this.keyPath, key);
        return key;
    }
}
exports.FileBackedSoftwareKeyStore = FileBackedSoftwareKeyStore;
function atomicWriteFile(filePath, data) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${(0, node_crypto_1.randomBytes)(6).toString('hex')}.tmp`;
    const fd = node_fs_1.default.openSync(tmp, 'w');
    try {
        node_fs_1.default.writeFileSync(fd, data);
        node_fs_1.default.fsyncSync(fd);
    }
    finally {
        node_fs_1.default.closeSync(fd);
    }
    try {
        node_fs_1.default.renameSync(tmp, filePath);
    }
    catch {
        node_fs_1.default.rmSync(filePath, { force: true });
        node_fs_1.default.renameSync(tmp, filePath);
    }
}
function tryOpenSqlite(filePath) {
    try {
        // node:sqlite is available on Node 22 without a native addon.
        const { DatabaseSync } = require('node:sqlite');
        node_fs_1.default.mkdirSync(node_path_1.default.dirname(filePath), { recursive: true });
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
    }
    catch {
        return null;
    }
}
class DurableEdgeSpoolStore {
    root;
    key;
    backend;
    sqlite;
    metadataPath;
    artifactsDir;
    constructor(root, key) {
        this.root = root;
        this.key = key;
        node_fs_1.default.mkdirSync(root, { recursive: true });
        this.artifactsDir = node_path_1.default.join(root, 'artifacts');
        node_fs_1.default.mkdirSync(this.artifactsDir, { recursive: true });
        this.metadataPath = node_path_1.default.join(root, 'metadata.json');
        this.sqlite = tryOpenSqlite(node_path_1.default.join(root, 'spool.sqlite'));
        this.backend = this.sqlite ? 'sqlite' : 'json';
        this.reconcile();
    }
    get(clientEvidenceId) {
        const row = this.readRow(clientEvidenceId);
        if (!row)
            return null;
        return this.hydrate(row);
    }
    put(record) {
        const artifactRelPath = node_path_1.default.posix.join('artifacts', `${record.clientEvidenceId}.bin`);
        const artifactPath = node_path_1.default.join(this.root, artifactRelPath);
        const blob = Buffer.concat([
            Buffer.from(record.iv, 'base64url'),
            Buffer.from(record.authTag, 'base64url'),
            Buffer.from(record.ciphertext, 'base64url'),
        ]);
        atomicWriteFile(artifactPath, blob);
        const row = {
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
    list() {
        return this.readAllRows().map((row) => this.hydrate(row));
    }
    reconcile() {
        const resetToPending = [];
        const missingFiles = [];
        const rows = this.readAllRows();
        for (const row of rows) {
            const artifactPath = node_path_1.default.join(this.root, row.artifactRelPath);
            if (!node_fs_1.default.existsSync(artifactPath)) {
                missingFiles.push(row.clientEvidenceId);
                const unsigned = {
                    clientEvidenceId: row.clientEvidenceId,
                    fulfillmentSessionId: row.fulfillmentSessionId,
                    artifactType: row.artifactType,
                    folder: 'attention',
                    acquisitionAssurance: row.acquisitionAssurance,
                    transportState: 'ATTENTION',
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
                    metadataMac: (0, queue_1.edgeSpoolMetadataMac)(this.key, unsigned),
                });
                continue;
            }
            if (row.transportState === 'UPLOADING') {
                const nextState = 'PENDING';
                const next = {
                    ...row,
                    transportState: nextState,
                    folder: edge_protocol_1.edgeQueueFolderForTransport[nextState],
                };
                this.writeRow({
                    ...next,
                    metadataMac: (0, queue_1.edgeSpoolMetadataMac)(this.key, { ...this.hydrate(row), transportState: nextState, folder: next.folder }),
                });
                resetToPending.push(row.clientEvidenceId);
            }
        }
        const known = new Set(rows.map((row) => node_path_1.default.basename(row.artifactRelPath)));
        const orphanFiles = [];
        for (const name of node_fs_1.default.readdirSync(this.artifactsDir)) {
            if (!name.endsWith('.bin'))
                continue;
            if (!known.has(name))
                orphanFiles.push(name);
        }
        return { resetToPending, missingFiles, orphanFiles };
    }
    hydrate(row) {
        const artifactPath = node_path_1.default.join(this.root, row.artifactRelPath);
        const blob = node_fs_1.default.readFileSync(artifactPath);
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
    readRow(clientEvidenceId) {
        if (this.sqlite) {
            const row = this.sqlite.db.prepare('SELECT * FROM spool_metadata WHERE client_evidence_id = ?').get(clientEvidenceId);
            return row ? this.fromSqlite(row) : null;
        }
        return this.readJson().find((item) => item.clientEvidenceId === clientEvidenceId) ?? null;
    }
    readAllRows() {
        if (this.sqlite) {
            return this.sqlite.db.prepare('SELECT * FROM spool_metadata').all().map((row) => this.fromSqlite(row));
        }
        return this.readJson();
    }
    writeRow(row) {
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
      `).run(row.clientEvidenceId, row.fulfillmentSessionId, row.artifactType, row.folder, row.acquisitionAssurance, row.transportState, row.plaintextSha256, row.sizeBytes, row.iv, row.authTag, row.metadataMac, row.artifactRelPath);
            return;
        }
        const rows = this.readJson().filter((item) => item.clientEvidenceId !== row.clientEvidenceId);
        rows.push(row);
        atomicWriteFile(this.metadataPath, JSON.stringify({ schemaVersion: 1, records: rows }, null, 2));
    }
    readJson() {
        try {
            const parsed = JSON.parse(node_fs_1.default.readFileSync(this.metadataPath, 'utf8'));
            return parsed.records ?? [];
        }
        catch {
            return [];
        }
    }
    fromSqlite(row) {
        return {
            clientEvidenceId: String(row.client_evidence_id),
            fulfillmentSessionId: String(row.fulfillment_session_id),
            artifactType: String(row.artifact_type),
            folder: row.folder,
            acquisitionAssurance: row.acquisition_assurance,
            transportState: row.transport_state,
            plaintextSha256: String(row.plaintext_sha256),
            sizeBytes: Number(row.size_bytes),
            iv: String(row.iv),
            authTag: String(row.auth_tag),
            metadataMac: String(row.metadata_mac),
            artifactRelPath: String(row.artifact_rel_path),
        };
    }
}
exports.DurableEdgeSpoolStore = DurableEdgeSpoolStore;
function openDurableEncryptedEdgeQueue(root, keyStore) {
    const key = keyStore.loadOrCreate();
    const store = new DurableEdgeSpoolStore(root, key);
    return { queue: new queue_1.EncryptedEdgeQueue(key, store), store, key };
}
function spoolArtifactDigest(filePath) {
    return (0, node_crypto_1.createHash)('sha256').update(node_fs_1.default.readFileSync(filePath)).digest('hex');
}
//# sourceMappingURL=persistent-queue.js.map