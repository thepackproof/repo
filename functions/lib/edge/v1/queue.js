"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EncryptedEdgeQueue = void 0;
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
class EncryptedEdgeQueue {
    key;
    records = new Map();
    constructor(key) {
        this.key = key;
        if (key.length !== 32)
            throw new Error('Edge spool key must be 32 bytes.');
    }
    enqueue(input) {
        const clientEvidenceId = input.clientEvidenceId ?? (0, node_crypto_1.randomUUID)();
        const existing = this.records.get(clientEvidenceId);
        if (existing)
            return existing;
        const iv = (0, node_crypto_1.randomBytes)(12);
        const cipher = (0, node_crypto_1.createCipheriv)('aes-256-gcm', this.key, iv);
        cipher.setAAD(Buffer.from(clientEvidenceId));
        const ciphertext = Buffer.concat([cipher.update(input.plaintext), cipher.final()]);
        const record = {
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
    decrypt(clientEvidenceId) {
        const record = this.require(clientEvidenceId);
        const decipher = (0, node_crypto_1.createDecipheriv)('aes-256-gcm', this.key, Buffer.from(record.iv, 'base64url'));
        decipher.setAAD(Buffer.from(clientEvidenceId));
        decipher.setAuthTag(Buffer.from(record.authTag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()]);
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
        return [...this.records.values()].filter((record) => folder === undefined || record.folder === folder);
    }
    label(clientEvidenceId) {
        return (0, edge_protocol_1.syncLabelForQueueObject)(this.require(clientEvidenceId));
    }
    move(clientEvidenceId, to) {
        const record = this.require(clientEvidenceId);
        assertTransition(record.transportState, to);
        const next = {
            ...record,
            transportState: to,
            folder: edge_protocol_1.edgeQueueFolderForTransport[to],
        };
        this.records.set(clientEvidenceId, next);
        return next;
    }
    require(clientEvidenceId) {
        const record = this.records.get(clientEvidenceId);
        if (!record)
            throw new Error(`Edge queue object ${clientEvidenceId} was not found.`);
        return record;
    }
}
exports.EncryptedEdgeQueue = EncryptedEdgeQueue;
function createSoftwareWrappedSpoolKey() {
    return (0, node_crypto_1.randomBytes)(32);
}
//# sourceMappingURL=queue.js.map