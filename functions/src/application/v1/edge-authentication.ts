import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as signEd25519, verify as verifyEd25519, type KeyObject } from 'node:crypto';
import {
  edgeRequestBindingSchema,
  edgeRequestSignedPayload,
  type EdgeRequestBinding,
  type SignedEdgeRequest,
} from '../../domain/v1/edge-protocol';
import { ApplicationError } from './errors';

export type EdgePrincipal = {
  edgeAgentId: string;
  organizationId: string;
  siteId: string;
  stationId: string;
  sessionId: string | null;
  credentialId: string;
  credentialStatus: 'ACTIVE';
  publicKeySpkiSha256: string;
};

export type EdgeCredentialRecord = {
  credentialId: string;
  edgeAgentId: string;
  organizationId: string;
  siteId: string;
  stationId: string;
  publicKeySpki: Buffer;
  status: 'ACTIVE' | 'ROTATING' | 'REVOKED';
};

export interface EdgeCredentialDirectory {
  getByEdgeAgentId(edgeAgentId: string): EdgeCredentialRecord | null;
  put(record: EdgeCredentialRecord): void;
}

export interface EdgeNonceStore {
  seen(nonce: string): boolean;
  remember(nonce: string): void;
}

export class MemoryEdgeCredentialDirectory implements EdgeCredentialDirectory {
  private readonly records = new Map<string, EdgeCredentialRecord>();

  getByEdgeAgentId(edgeAgentId: string): EdgeCredentialRecord | null {
    return this.records.get(edgeAgentId) ?? null;
  }

  put(record: EdgeCredentialRecord): void {
    this.records.set(record.edgeAgentId, record);
  }
}

export class MemoryNonceStore implements EdgeNonceStore {
  private readonly used = new Set<string>();

  seen(nonce: string): boolean {
    return this.used.has(nonce);
  }

  remember(nonce: string): void {
    this.used.add(nonce);
  }
}

export function generateEdgeDeviceKeyPair(): { publicKeySpki: Buffer; privateKeyPkcs8: Buffer; publicKey: KeyObject; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey,
    privateKey,
    publicKeySpki: publicKey.export({ type: 'spki', format: 'der' }) as Buffer,
    privateKeyPkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer,
  };
}

export function sha256Buffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function edgeRequestBodySha256(body: unknown): string {
  return createHash('sha256').update(canonicalEdgeBody(body)).digest('hex');
}

export function canonicalEdgeBody(body: unknown): string {
  return JSON.stringify(sortValue(body));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

export class EdgeRequestSigner {
  constructor(private readonly privateKeyPkcs8: Buffer) {}

  sign(binding: EdgeRequestBinding, body: unknown): SignedEdgeRequest {
    const parsed = edgeRequestBindingSchema.parse(binding);
    const bodySha256 = edgeRequestBodySha256(body);
    const key = createPrivateKey({ key: this.privateKeyPkcs8, format: 'der', type: 'pkcs8' });
    const signature = signEd25519(null, edgeRequestSignedPayload(parsed, bodySha256), key);
    return {
      binding: parsed,
      bodySha256,
      signatureBase64: signature.toString('base64url'),
    };
  }
}

export class EdgeAuthenticationService {
  constructor(
    private readonly credentials: EdgeCredentialDirectory,
    private readonly nonces: EdgeNonceStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly maxSkewMs = 5 * 60 * 1000,
  ) {}

  register(record: EdgeCredentialRecord): void {
    this.credentials.put(record);
  }

  authenticate(request: SignedEdgeRequest, body: unknown): EdgePrincipal {
    const binding = edgeRequestBindingSchema.parse(request.binding);
    const expectedDigest = edgeRequestBodySha256(body);
    if (expectedDigest !== request.bodySha256) {
      throw new ApplicationError('UNAUTHENTICATED', 'EDGE_BODY_DIGEST_MISMATCH', 'The Edge request body digest does not match the signed digest.');
    }
    const credential = this.credentials.getByEdgeAgentId(binding.edgeAgentId);
    if (!credential) {
      throw new ApplicationError('UNAUTHENTICATED', 'EDGE_CREDENTIAL_NOT_FOUND', 'No Edge installation credential is registered for this agent.');
    }
    if (credential.status === 'REVOKED') {
      throw new ApplicationError('FORBIDDEN', 'EDGE_CREDENTIAL_REVOKED', 'The Edge installation credential has been revoked.');
    }
    if (credential.status !== 'ACTIVE' && credential.status !== 'ROTATING') {
      throw new ApplicationError('FORBIDDEN', 'EDGE_CREDENTIAL_NOT_ACTIVE', 'The Edge installation credential is not active.');
    }
    if (
      credential.organizationId !== binding.organizationId
      || credential.siteId !== binding.siteId
      || credential.stationId !== binding.stationId
      || credential.edgeAgentId !== binding.edgeAgentId
    ) {
      throw new ApplicationError('FORBIDDEN', 'EDGE_BINDING_MISMATCH', 'The signed Edge request is not bound to this installation.');
    }
    const timestampMs = Date.parse(binding.timestamp);
    const nowMs = this.clock().getTime();
    if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > this.maxSkewMs) {
      throw new ApplicationError('UNAUTHENTICATED', 'EDGE_TIMESTAMP_OUT_OF_WINDOW', 'The Edge request timestamp is outside the accepted window.');
    }
    if (this.nonces.seen(binding.nonce)) {
      throw new ApplicationError('UNAUTHENTICATED', 'EDGE_NONCE_REPLAYED', 'The Edge request nonce has already been used.');
    }
    const publicKey = createPublicKey({ key: credential.publicKeySpki, format: 'der', type: 'spki' });
    const ok = verifyEd25519(
      null,
      edgeRequestSignedPayload(binding, request.bodySha256),
      publicKey,
      Buffer.from(request.signatureBase64, 'base64url'),
    );
    if (!ok) {
      throw new ApplicationError('UNAUTHENTICATED', 'EDGE_SIGNATURE_INVALID', 'The Edge request signature is not valid for the registered credential.');
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
