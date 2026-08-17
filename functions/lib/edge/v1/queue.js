"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptedEdgeQueue = exports.MemoryEdgeSpoolStore = void 0;
exports.edgeSpoolMetadataMac = edgeSpoolMetadataMac;
exports.encryptEdgeSpool = encryptEdgeSpool;
exports.decryptEdgeSpool = decryptEdgeSpool;
exports.createSoftwareWrappedSpoolKey = createSoftwareWrappedSpoolKey;
const node_crypto_1 = require("node:crypto");
const edge_protocol_1 = require("../../domain/v1/edge-protocol");
function assertTransition(from, to) {
    const allowed = {
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
function edgeSpoolMetadataMac(key, record) {
    return (0, node_crypto_1.createHmac)('sha256', key).update([
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
function encryptEdgeSpool(key, plaintext, aad) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
        iv: iv.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        authTag: cipher.getAuthTag().toString('base64url'),
    };
}
function decryptEdgeSpool(key, record, aad) {
    const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', key, Buffer.from(record.iv, 'base64url'));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]);
}
class MemoryEdgeSpoolStore {
    records = new Map();
    get(clientEvidenceId) {
        return this.records.get(clientEvidenceId) ?? null;
    }
    put(record) {
        this.records.set(record.clientEvidenceId, record);
    }
    list() {
        return [...this.records.values()];
    }
}
exports.MemoryEdgeSpoolStore = MemoryEdgeSpoolStore;
class EncryptedEdgeQueue {
    key;
    store;
    constructor(key, store = new MemoryEdgeSpoolStore()) {
        this.key = key;
        this.store = store;
        if (key.length !== 32)
            throw new Error('Edge spool key must be 32 bytes.');
    }
    enqueue(input) {
        const clientEvidenceId = input.clientEvidenceId ?? (0, node_crypto_1.randomUUID)();
        const existing = this.store.get(clientEvidenceId);
        if (existing) {
            this.assertMetadataMac(existing);
            return existing;
        }
        const acquisitionAssurance = input.onlineAtCapture ? 'ONLINE_ASSURED' : 'OFFLINE_CAPTURED';
        const aad = (0, edge_protocol_1.edgeSpoolAad)({
            clientEvidenceId,
            fulfillmentSessionId: input.fulfillmentSessionId,
            artifactType: input.artifactType,
            plaintextSha256: input.plaintextSha256,
            sizeBytes: input.plaintext.length,
            acquisitionAssurance,
        });
        const encrypted = encryptEdgeSpool(this.key, input.plaintext, aad);
        const unsigned = {
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
        const record = {
            ...unsigned,
            metadataMac: edgeSpoolMetadataMac(this.key, unsigned),
        };
        this.store.put(record);
        return record;
    }
    decrypt(clientEvidenceId) {
        const record = this.require(clientEvidenceId);
        const aad = (0, edge_protocol_1.edgeSpoolAad)(record);
        return decryptEdgeSpool(this.key, record, aad);
    }
    markUploading(clientEvidenceId) {
        return this.move(clientEvidenceId, 'UPLOADING');
    }
    markUploaded(clientEvidenceId) {
        if ((0, edge_protocol_1.uploadSuccessIsServerFinalization)()) {
            throw new Error('A successful Edge upload is not server finalization.');
        }
        return this.move(clientEvidenceId, 'AWAITING_FINALIZATION');
    }
    markServerFinalized(clientEvidenceId) {
        return this.move(clientEvidenceId, 'SERVER_FINALIZED');
    }
    markAttention(clientEvidenceId) {
        return this.move(clientEvidenceId, 'ATTENTION');
    }
    retryFromAttention(clientEvidenceId) {
        return this.move(clientEvidenceId, 'PENDING');
    }
    list(folder) {
        return this.store.list().filter((record) => folder === undefined || record.folder === folder);
    }
    label(clientEvidenceId) {
        return (0, edge_protocol_1.syncLabelForQueueObject)(this.require(clientEvidenceId));
    }
    move(clientEvidenceId, to) {
        const record = this.require(clientEvidenceId);
        assertTransition(record.transportState, to);
        const unsigned = {
            ...record,
            transportState: to,
            folder: edge_protocol_1.edgeQueueFolderForTransport[to],
        };
        const next = {
            ...unsigned,
            metadataMac: edgeSpoolMetadataMac(this.key, unsigned),
        };
        this.store.put(next);
        return next;
    }
    require(clientEvidenceId) {
        const record = this.store.get(clientEvidenceId);
        if (!record)
            throw new Error(`Edge queue object ${clientEvidenceId} was not found.`);
        this.assertMetadataMac(record);
        return record;
    }
    assertMetadataMac(record) {
        const expected = edgeSpoolMetadataMac(this.key, record);
        if (expected !== record.metadataMac) {
            throw new Error(`Edge spool metadata MAC mismatch for ${record.clientEvidenceId}.`);
        }
    }
}
exports.EncryptedEdgeQueue = EncryptedEdgeQueue;
function createSoftwareWrappedSpoolKey() {
    return (0, node_crypto_1.randomBytes)(32);
}
//# sourceMappingURL=queue.js.map