import { createHmac, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { MerchantAuthorizationPolicy } from '../../application/v1/merchant-transaction-service';
import { ApiError, type ApiEnvironment, type ApiScope, type MerchantPrincipal, apiScopes } from './core';
import type { MerchantAuthenticator } from './ports';

const credentialIdPattern = /^[A-Za-z0-9_-]{16,64}$/;
const secretPattern = /^[A-Za-z0-9_-]{43,128}$/;

export function createApiSecretVerifier(secret: string, pepper: string): string {
  if (pepper.length < 32) throw new Error('API credential pepper must contain at least 32 characters.');
  return createHmac('sha256', pepper).update(`packproof-api-credential-v1\n${secret}`, 'utf8').digest('hex');
}

function constantTimeHexEquals(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(expected, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

function invalidCredential(): ApiError {
  return new ApiError(
    401,
    'INVALID_API_CREDENTIAL',
    'The merchant API credential is missing or invalid.',
    [],
    { 'WWW-Authenticate': 'Bearer realm="PackProof API", error="invalid_token"' },
  );
}

function parseAuthorization(authorization: string | undefined, environment: ApiEnvironment): { credentialId: string; secret: string } {
  const match = authorization ? /^Bearer\s+([^\s]+)$/i.exec(authorization.trim()) : null;
  if (!match) throw invalidCredential();
  const token = match[1];
  const prefix = `pp_${environment}_`;
  if (!token.startsWith(prefix)) throw invalidCredential();
  const separator = token.indexOf('.', prefix.length);
  if (separator < 0) throw invalidCredential();
  const credentialId = token.slice(prefix.length, separator);
  const secret = token.slice(separator + 1);
  if (!credentialIdPattern.test(credentialId) || !secretPattern.test(secret)) throw invalidCredential();
  return { credentialId, secret };
}

function validScopes(value: unknown): ApiScope[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !apiScopes.includes(entry as ApiScope))) {
    throw invalidCredential();
  }
  return [...new Set(value as ApiScope[])];
}

export class FirestoreMerchantAuthenticator implements MerchantAuthenticator {
  constructor(
    private readonly firestore: Firestore,
    private readonly getEnvironment: () => ApiEnvironment,
    private readonly getPepper: () => string,
  ) {}

  async authenticate(authorization: string | undefined): Promise<MerchantPrincipal> {
    const environment = this.getEnvironment();
    const parsed = parseAuthorization(authorization, environment);
    const credentialRef = this.firestore.collection('apiCredentials').doc(parsed.credentialId);
    const credentialSnap = await credentialRef.get();
    if (!credentialSnap.exists) throw invalidCredential();
    const credential = credentialSnap.data()!;
    const actualVerifier = createApiSecretVerifier(parsed.secret, this.getPepper());
    if (!constantTimeHexEquals(actualVerifier, String(credential.secretVerifier ?? ''))) throw invalidCredential();
    if (credential.status !== 'ACTIVE' || credential.environment !== environment) throw invalidCredential();
    if (credential.expiresAt instanceof Timestamp && credential.expiresAt.toMillis() <= Date.now()) throw invalidCredential();
    if (credential.revokedAt) throw invalidCredential();

    const apiClientId = String(credential.apiClientId ?? '');
    const organizationId = String(credential.organizationId ?? '');
    if (!apiClientId || !organizationId) throw invalidCredential();
    const [clientSnap, organizationSnap] = await this.firestore.getAll(
      this.firestore.collection('apiClients').doc(apiClientId),
      this.firestore.collection('organizations').doc(organizationId),
    );
    if (!clientSnap.exists || !organizationSnap.exists) throw invalidCredential();
    const client = clientSnap.data()!;
    const organization = organizationSnap.data()!;
    if (client.status !== 'ACTIVE' || organization.status !== 'ACTIVE'
      || client.organizationId !== organizationId || client.environment !== environment) {
      throw invalidCredential();
    }

    const credentialScopes = validScopes(credential.scopes);
    const clientScopes = new Set(validScopes(client.scopes));
    const scopes = credentialScopes.filter((scope) => clientScopes.has(scope));
    const principal: MerchantPrincipal = {
      type: 'MERCHANT_API_CLIENT',
      credentialId: parsed.credentialId,
      apiClientId,
      organizationId,
      environment,
      scopes,
      integrationId: typeof client.integrationId === 'string' && client.integrationId ? client.integrationId : null,
    };

    // Use append-only usage records instead of mutating one credential document
    // on every request; the latter becomes a per-credential write hotspot.
    await credentialRef.collection('usage').add({
      apiClientId,
      organizationId,
      environment,
      usedAt: FieldValue.serverTimestamp(),
    });
    return principal;
  }
}

export class AuthorizationService extends MerchantAuthorizationPolicy {}
