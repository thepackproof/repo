"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HC1_KEY_REGISTRY = exports.keyAlgorithms = exports.keyPurposes = void 0;
exports.lookupKey = lookupKey;
exports.assertHmacNotPublicSignature = assertHmacNotPublicSignature;
exports.rotateKey = rotateKey;
exports.keyPurposes = [
    'EVIDENCE_MANIFEST_MAC',
    'CONNECT_CALLBACK_HMAC',
    'MERCHANT_API_PEPPER',
    'WEBHOOK_SIGNING',
    'PARTICIPANT_TOKEN',
    'HANDOFF_TOKEN',
    'EDGE_CREDENTIAL',
];
exports.keyAlgorithms = ['HMAC-SHA256'];
exports.HC1_KEY_REGISTRY = [
    {
        keyId: 'packproof-manifest-v1',
        purpose: 'EVIDENCE_MANIFEST_MAC',
        algorithm: 'HMAC-SHA256',
        verificationPolicy: 'PACKPROOF_SERVICE_ONLY',
        publicVerificationAvailable: false,
        createdAt: '2026-08-11T00:00:00.000Z',
        activatedAt: '2026-08-11T00:00:00.000Z',
        retiredAt: null,
        revokedAt: null,
    },
    {
        keyId: 'packproof-connect-callback-v1',
        purpose: 'CONNECT_CALLBACK_HMAC',
        algorithm: 'HMAC-SHA256',
        verificationPolicy: 'SERVER_ONLY',
        publicVerificationAvailable: false,
        createdAt: '2026-08-11T00:00:00.000Z',
        activatedAt: '2026-08-11T00:00:00.000Z',
        retiredAt: null,
        revokedAt: null,
    },
    {
        keyId: 'packproof-merchant-pepper-v1',
        purpose: 'MERCHANT_API_PEPPER',
        algorithm: 'HMAC-SHA256',
        verificationPolicy: 'SERVER_ONLY',
        publicVerificationAvailable: false,
        createdAt: '2026-08-11T00:00:00.000Z',
        activatedAt: '2026-08-11T00:00:00.000Z',
        retiredAt: null,
        revokedAt: null,
    },
];
function lookupKey(keyId) {
    return exports.HC1_KEY_REGISTRY.find((entry) => entry.keyId === keyId) ?? null;
}
function assertHmacNotPublicSignature(record) {
    if (record.algorithm !== 'HMAC-SHA256') {
        throw new Error('HC-1 only registers HMAC-SHA256 keys.');
    }
    if (record.publicVerificationAvailable) {
        throw new Error('HMAC records cannot be presented as publicly verifiable digital signatures.');
    }
    if (record.verificationPolicy !== 'PACKPROOF_SERVICE_ONLY' && record.verificationPolicy !== 'SERVER_ONLY') {
        throw new Error('HMAC verification policy must stay service-only.');
    }
}
function rotateKey(previous, nextKeyId, rotatedAt) {
    assertHmacNotPublicSignature(previous);
    return {
        ...previous,
        keyId: nextKeyId,
        createdAt: rotatedAt,
        activatedAt: rotatedAt,
        retiredAt: null,
        revokedAt: null,
    };
}
//# sourceMappingURL=key-registry.js.map