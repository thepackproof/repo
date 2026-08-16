"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthorizationService = exports.FirestoreMerchantAuthenticator = void 0;
exports.createApiSecretVerifier = createApiSecretVerifier;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const merchant_transaction_service_1 = require("../../application/v1/merchant-transaction-service");
const core_1 = require("./core");
const credentialIdPattern = /^[A-Za-z0-9_-]{16,64}$/;
const secretPattern = /^[A-Za-z0-9_-]{43,128}$/;
function createApiSecretVerifier(secret, pepper) {
    if (pepper.length < 32)
        throw new Error('API credential pepper must contain at least 32 characters.');
    return (0, node_crypto_1.createHmac)('sha256', pepper).update(`packproof-api-credential-v1\n${secret}`, 'utf8').digest('hex');
}
function constantTimeHexEquals(actual, expected) {
    if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected))
        return false;
    const left = Buffer.from(actual, 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && (0, node_crypto_1.timingSafeEqual)(left, right);
}
function invalidCredential() {
    return new core_1.ApiError(401, 'INVALID_API_CREDENTIAL', 'The merchant API credential is missing or invalid.', [], { 'WWW-Authenticate': 'Bearer realm="PackProof API", error="invalid_token"' });
}
function parseAuthorization(authorization, environment) {
    const match = authorization ? /^Bearer\s+([^\s]+)$/i.exec(authorization.trim()) : null;
    if (!match)
        throw invalidCredential();
    const token = match[1];
    const prefix = `pp_${environment}_`;
    if (!token.startsWith(prefix))
        throw invalidCredential();
    const separator = token.indexOf('.', prefix.length);
    if (separator < 0)
        throw invalidCredential();
    const credentialId = token.slice(prefix.length, separator);
    const secret = token.slice(separator + 1);
    if (!credentialIdPattern.test(credentialId) || !secretPattern.test(secret))
        throw invalidCredential();
    return { credentialId, secret };
}
function validScopes(value) {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !core_1.apiScopes.includes(entry))) {
        throw invalidCredential();
    }
    return [...new Set(value)];
}
class FirestoreMerchantAuthenticator {
    firestore;
    getEnvironment;
    getPepper;
    constructor(firestore, getEnvironment, getPepper) {
        this.firestore = firestore;
        this.getEnvironment = getEnvironment;
        this.getPepper = getPepper;
    }
    async authenticate(authorization) {
        const environment = this.getEnvironment();
        const parsed = parseAuthorization(authorization, environment);
        const credentialRef = this.firestore.collection('apiCredentials').doc(parsed.credentialId);
        const credentialSnap = await credentialRef.get();
        if (!credentialSnap.exists)
            throw invalidCredential();
        const credential = credentialSnap.data();
        const actualVerifier = createApiSecretVerifier(parsed.secret, this.getPepper());
        if (!constantTimeHexEquals(actualVerifier, String(credential.secretVerifier ?? '')))
            throw invalidCredential();
        if (credential.status !== 'ACTIVE' || credential.environment !== environment)
            throw invalidCredential();
        if (credential.expiresAt instanceof firestore_1.Timestamp && credential.expiresAt.toMillis() <= Date.now())
            throw invalidCredential();
        if (credential.revokedAt)
            throw invalidCredential();
        const apiClientId = String(credential.apiClientId ?? '');
        const organizationId = String(credential.organizationId ?? '');
        if (!apiClientId || !organizationId)
            throw invalidCredential();
        const [clientSnap, organizationSnap] = await this.firestore.getAll(this.firestore.collection('apiClients').doc(apiClientId), this.firestore.collection('organizations').doc(organizationId));
        if (!clientSnap.exists || !organizationSnap.exists)
            throw invalidCredential();
        const client = clientSnap.data();
        const organization = organizationSnap.data();
        if (client.status !== 'ACTIVE' || organization.status !== 'ACTIVE'
            || client.organizationId !== organizationId || client.environment !== environment) {
            throw invalidCredential();
        }
        const credentialScopes = validScopes(credential.scopes);
        const clientScopes = new Set(validScopes(client.scopes));
        const scopes = credentialScopes.filter((scope) => clientScopes.has(scope));
        const principal = {
            type: 'MERCHANT_API_CLIENT',
            credentialId: parsed.credentialId,
            apiClientId,
            organizationId,
            environment,
            scopes,
            integrationId: typeof client.integrationId === 'string' && client.integrationId ? client.integrationId : null,
        };
        this.recordUsageBestEffort(credentialRef, { apiClientId, organizationId, environment });
        return principal;
    }
    recordUsageBestEffort(credentialRef, payload) {
        void credentialRef.collection('usage').add({
            ...payload,
            usedAt: firestore_1.FieldValue.serverTimestamp(),
        }).catch((error) => {
            console.warn('api_credential_usage_record_failed', error);
        });
    }
}
exports.FirestoreMerchantAuthenticator = FirestoreMerchantAuthenticator;
class AuthorizationService extends merchant_transaction_service_1.MerchantAuthorizationPolicy {
}
exports.AuthorizationService = AuthorizationService;
//# sourceMappingURL=security.js.map