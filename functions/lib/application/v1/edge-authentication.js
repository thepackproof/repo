"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdgeAuthenticationService = exports.EdgeRequestSigner = exports.MemoryNonceStore = exports.MemoryEdgeCredentialDirectory = void 0;
exports.generateEdgeDeviceKeyPair = generateEdgeDeviceKeyPair;
exports.sha256Buffer = sha256Buffer;
exports.edgeRequestBodySha256 = edgeRequestBodySha256;
exports.canonicalEdgeBody = canonicalEdgeBody;
const node_crypto_1 = require("node:crypto");
const edge_protocol_1 = require("../../domain/v1/edge-protocol");
const errors_1 = require("./errors");
class MemoryEdgeCredentialDirectory {
    records = new Map();
    getByEdgeAgentId(edgeAgentId) {
        return this.records.get(edgeAgentId) ?? null;
    }
    put(record) {
        this.records.set(record.edgeAgentId, record);
    }
}
exports.MemoryEdgeCredentialDirectory = MemoryEdgeCredentialDirectory;
class MemoryNonceStore {
    used = new Set();
    seen(nonce) {
        return this.used.has(nonce);
    }
    remember(nonce) {
        this.used.add(nonce);
    }
}
exports.MemoryNonceStore = MemoryNonceStore;
function generateEdgeDeviceKeyPair() {
    const { publicKey, privateKey } = (0, node_crypto_1.generateKeyPairSync)('ed25519');
    return {
        publicKey,
        privateKey,
        publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }),
        privateKeyPkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }),
    };
}
function sha256Buffer(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
function edgeRequestBodySha256(body) {
    return (0, node_crypto_1.createHash)('sha256').update(canonicalEdgeBody(body)).digest('hex');
}
function canonicalEdgeBody(body) {
    return JSON.stringify(sortValue(body));
}
function sortValue(value) {
    if (Array.isArray(value))
        return value.map(sortValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, sortValue(nested)]));
    }
    return value;
}
class EdgeRequestSigner {
    privateKeyPkcs8;
    constructor(privateKeyPkcs8) {
        this.privateKeyPkcs8 = privateKeyPkcs8;
    }
    sign(binding, body) {
        const parsed = edge_protocol_1.edgeRequestBindingSchema.parse(binding);
        const bodySha256 = edgeRequestBodySha256(body);
        const key = (0, node_crypto_1.createPrivateKey)({ key: this.privateKeyPkcs8, format: 'der', type: 'pkcs8' });
        const signature = (0, node_crypto_1.sign)(null, (0, edge_protocol_1.edgeRequestSignedPayload)(parsed, bodySha256), key);
        return {
            binding: parsed,
            bodySha256,
            signatureBase64: signature.toString('base64url'),
        };
    }
}
exports.EdgeRequestSigner = EdgeRequestSigner;
class EdgeAuthenticationService {
    credentials;
    nonces;
    clock;
    maxSkewMs;
    constructor(credentials, nonces, clock = () => new Date(), maxSkewMs = 5 * 60 * 1000) {
        this.credentials = credentials;
        this.nonces = nonces;
        this.clock = clock;
        this.maxSkewMs = maxSkewMs;
    }
    register(record) {
        this.credentials.put(record);
    }
    authenticate(request, body) {
        const binding = edge_protocol_1.edgeRequestBindingSchema.parse(request.binding);
        const expectedDigest = edgeRequestBodySha256(body);
        if (expectedDigest !== request.bodySha256) {
            throw new errors_1.ApplicationError('UNAUTHENTICATED', 'EDGE_BODY_DIGEST_MISMATCH', 'The Edge request body digest does not match the signed digest.');
        }
        const credential = this.credentials.getByEdgeAgentId(binding.edgeAgentId);
        if (!credential) {
            throw new errors_1.ApplicationError('UNAUTHENTICATED', 'EDGE_CREDENTIAL_NOT_FOUND', 'No Edge installation credential is registered for this agent.');
        }
        if (credential.status === 'REVOKED') {
            throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_CREDENTIAL_REVOKED', 'The Edge installation credential has been revoked.');
        }
        if (credential.status !== 'ACTIVE' && credential.status !== 'ROTATING') {
            throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_CREDENTIAL_NOT_ACTIVE', 'The Edge installation credential is not active.');
        }
        if (credential.organizationId !== binding.organizationId
            || credential.siteId !== binding.siteId
            || credential.stationId !== binding.stationId
            || credential.edgeAgentId !== binding.edgeAgentId) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'EDGE_BINDING_MISMATCH', 'The signed Edge request is not bound to this installation.');
        }
        const timestampMs = Date.parse(binding.timestamp);
        const nowMs = this.clock().getTime();
        if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > this.maxSkewMs) {
            throw new errors_1.ApplicationError('UNAUTHENTICATED', 'EDGE_TIMESTAMP_OUT_OF_WINDOW', 'The Edge request timestamp is outside the accepted window.');
        }
        if (this.nonces.seen(binding.nonce)) {
            throw new errors_1.ApplicationError('UNAUTHENTICATED', 'EDGE_NONCE_REPLAYED', 'The Edge request nonce has already been used.');
        }
        const publicKey = (0, node_crypto_1.createPublicKey)({ key: credential.publicKeySpki, format: 'der', type: 'spki' });
        const ok = (0, node_crypto_1.verify)(null, (0, edge_protocol_1.edgeRequestSignedPayload)(binding, request.bodySha256), publicKey, Buffer.from(request.signatureBase64, 'base64url'));
        if (!ok) {
            throw new errors_1.ApplicationError('UNAUTHENTICATED', 'EDGE_SIGNATURE_INVALID', 'The Edge request signature is not valid for the registered credential.');
        }
        this.nonces.remember(binding.nonce);
        return {
            edgeAgentId: credential.edgeAgentId,
            organizationId: credential.organizationId,
            siteId: credential.siteId,
            stationId: credential.stationId,
            sessionId: binding.sessionId,
            credentialId: credential.credentialId,
            credentialStatus: 'ACTIVE',
            publicKeySpkiSha256: sha256Buffer(credential.publicKeySpki),
        };
    }
}
exports.EdgeAuthenticationService = EdgeAuthenticationService;
//# sourceMappingURL=edge-authentication.js.map