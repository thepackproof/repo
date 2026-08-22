export const keyPurposes = [
  'EVIDENCE_MANIFEST_MAC',
  'CONNECT_CALLBACK_HMAC',
  'MERCHANT_API_PEPPER',
  'WEBHOOK_SIGNING',
  'PARTICIPANT_TOKEN',
  'HANDOFF_TOKEN',
  'EDGE_CREDENTIAL',
] as const;
export type KeyPurpose = (typeof keyPurposes)[number];

export const keyAlgorithms = ['HMAC-SHA256'] as const;
export type KeyAlgorithm = (typeof keyAlgorithms)[number];

export type KeyRegistryRecord = {
  keyId: string;
  purpose: KeyPurpose;
  algorithm: KeyAlgorithm;
  verificationPolicy: 'PACKPROOF_SERVICE_ONLY' | 'SERVER_ONLY';
  publicVerificationAvailable: false;
  createdAt: string;
  activatedAt: string;
  retiredAt: string | null;
  revokedAt: string | null;
};

export const HC1_KEY_REGISTRY: readonly KeyRegistryRecord[] = [
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

export function lookupKey(keyId: string): KeyRegistryRecord | null {
  return HC1_KEY_REGISTRY.find((entry) => entry.keyId === keyId) ?? null;
}

export function assertHmacNotPublicSignature(record: Pick<KeyRegistryRecord, 'algorithm' | 'verificationPolicy' | 'publicVerificationAvailable'>): void {
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

export function rotateKey(previous: KeyRegistryRecord, nextKeyId: string, rotatedAt: string): KeyRegistryRecord {
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
