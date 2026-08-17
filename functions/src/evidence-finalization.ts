import { createHash, createHmac } from 'node:crypto';
import {
  BUNDLE_BINDING_PROFILE,
  CANONICALIZATION_PROFILE,
  EVIDENCE_MANIFEST_SCHEMA_VERSION,
  canonicalizeJson,
  createEvidenceBundleSha256,
  detectSupportedMediaType,
  sha256Hex,
} from './evidence-format';

export type AcquisitionClass = 'NATIVE_MOBILE' | 'ENTERPRISE_EDGE' | 'EXTERNAL_DECLARED';

export type PendingEvidenceGrant = {
  transactionId: string;
  uploaderId: string;
  uploadId: string;
  clientEvidenceId: string | null;
  evidenceType: string;
  contentType: string;
  originalName: string;
  clientSha256: string | null;
  clientSizeBytes: number | null;
  storagePath: string;
  captureSessionId: string | null;
  returnPassportId: string | null;
  connectSessionId: string | null;
  clientManifest: Record<string, unknown> | null;
  attestationSnapshot: {
    mode: 'JIT_APP_CHECK' | 'OFFLINE_UNATTESTED' | 'ENTERPRISE_EDGE';
    deviceKeySignatureValid?: boolean | null;
    deviceKeyProof?: { hardwareBacked?: boolean | null } | null;
    captureSessionId?: string | null;
    nonce?: string | null;
    appId?: string | null;
    issuedAt?: string | null;
    captureWindowEndsAt?: string | null;
    tokenReplayDetected?: boolean | null;
    reasonCodes?: string[];
    sessionMode?: string | null;
    maxEvidenceCount?: number | null;
    captureProfileId?: string | null;
    captureGroupId?: string | null;
  } | null;
  carrierContext: { matchStatus?: string; scannedTrackingNumber?: string | null } | null;
  requestFingerprint: string | null;
  acquisitionClass: AcquisitionClass | null;
  edgeAgentId: string | null;
  organizationId: string | null;
  fulfillmentSessionId: string | null;
  ingressNetwork: Record<string, unknown> | null;
};

export type ManifestSigner = {
  keyId: string;
  sign(canonicalJson: string): string;
};

export type ReceivedEvidenceObject = {
  bucket: string;
  storagePath: string;
  generation: string | null;
  timeCreated: string;
  size: number;
  contentType: string;
};

export function hmacManifestSigner(secret: string, keyId: string): ManifestSigner {
  return {
    keyId,
    sign(canonicalJson: string): string {
      return createHmac('sha256', secret).update(canonicalJson).digest('base64url');
    },
  };
}

export function acquisitionClassOf(value: unknown): AcquisitionClass | null {
  if (value === 'NATIVE_MOBILE' || value === 'ENTERPRISE_EDGE' || value === 'EXTERNAL_DECLARED') return value;
  return null;
}

export function attestationStatusForGrant(pending: Pick<PendingEvidenceGrant, 'attestationSnapshot' | 'clientManifest'>): string {
  if (pending.attestationSnapshot?.mode === 'ENTERPRISE_EDGE') {
    return pending.attestationSnapshot.deviceKeySignatureValid === true
      ? 'ENTERPRISE_EDGE_CERTIFICATE'
      : 'ENTERPRISE_EDGE_INSTALLATION';
  }
  if (pending.attestationSnapshot?.mode === 'JIT_APP_CHECK') {
    return pending.attestationSnapshot.deviceKeySignatureValid === true
      ? 'ONLINE_APP_CHECK_AND_KEY_POSSESSION'
      : 'ONLINE_APP_CHECK_ONLY';
  }
  if (pending.clientManifest) return 'OFFLINE_UNATTESTED';
  return 'NOT_PROVIDED';
}

export function uploaderAuthorizedForGrant(input: {
  participantIds: readonly string[];
  uploaderId: string;
  pending: Pick<PendingEvidenceGrant, 'acquisitionClass' | 'edgeAgentId'>;
}): boolean {
  if (input.pending.acquisitionClass === 'ENTERPRISE_EDGE') {
    return Boolean(input.pending.edgeAgentId) && input.pending.edgeAgentId === input.uploaderId;
  }
  return input.participantIds.includes(input.uploaderId);
}

export function uploaderRoleForGrant(input: {
  sellerId: string;
  buyerId: string | null;
  uploaderId: string;
  pending: Pick<PendingEvidenceGrant, 'acquisitionClass'>;
}): 'SELLER' | 'BUYER' | 'ENTERPRISE_STATION' {
  if (input.pending.acquisitionClass === 'ENTERPRISE_EDGE') return 'ENTERPRISE_STATION';
  return input.sellerId === input.uploaderId ? 'SELLER' : 'BUYER';
}

export function assuranceForFinalization(input: {
  clientManifest: Record<string, unknown> | null | undefined;
  attestationStatus: string;
  clientHashMatched: boolean | null;
  clientSizeMatched: boolean | null;
  contentTypeMatched: boolean;
  carrierStatus: string;
  clientTimeConsistencyStatus: string;
}) {
  const byteMismatch = input.clientHashMatched === false || input.clientSizeMatched === false || !input.contentTypeMatched;
  const manifest = input.clientManifest as { acquisitionQuality?: { status?: string; reasonCodes?: string[] }; attestation?: { reasonCodes?: string[] } } | null | undefined;
  return {
    acquisitionQuality: {
      status: manifest?.acquisitionQuality?.status ?? 'NOT_EVALUATED',
      reasonCodes: manifest?.acquisitionQuality?.reasonCodes ?? ['NO_CALIBRATED_QUALITY_GATE'],
    },
    appDeviceContext: {
      status: input.attestationStatus,
      reasonCodes: [
        ...(input.attestationStatus === 'OFFLINE_UNATTESTED'
          ? manifest?.attestation?.reasonCodes ?? ['NO_FRESH_ONLINE_ATTESTATION']
          : input.attestationStatus === 'ONLINE_APP_CHECK_ONLY'
            ? ['DEVICE_KEY_PROOF_NOT_AVAILABLE']
            : input.attestationStatus === 'ENTERPRISE_EDGE_INSTALLATION' || input.attestationStatus === 'ENTERPRISE_EDGE_CERTIFICATE'
              ? ['NOT_NATIVE_APP_CHECK']
              : []),
        ...(input.clientTimeConsistencyStatus === 'INCONSISTENT' ? ['CLIENT_WALL_MONOTONIC_DURATION_MISMATCH'] : []),
      ],
    },
    byteIntegrity: {
      status: byteMismatch ? 'MISMATCH' : input.clientHashMatched === true && input.clientSizeMatched === true ? 'MATCHED' : 'SERVER_HASH_ONLY',
      reasonCodes: [
        ...(input.clientHashMatched === false ? ['CLIENT_SERVER_HASH_MISMATCH'] : []),
        ...(input.clientSizeMatched === false ? ['CLIENT_SERVER_SIZE_MISMATCH'] : []),
        ...(!input.contentTypeMatched ? ['DECLARED_MEDIA_TYPE_MISMATCH'] : []),
      ],
    },
    physicalCorrespondence: {
      status: 'NOT_AVAILABLE',
      reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'],
    },
    carrierContext: {
      status: input.carrierStatus,
      reasonCodes: input.carrierStatus === 'MISMATCH' ? ['OBSERVED_TRACKING_DOES_NOT_MATCH_EXPECTED_CONTEXT'] : [],
    },
    businessLegalRelevance: {
      status: 'REVIEW_REQUIRED',
      reasonCodes: ['EXTERNAL_POLICY_AND_HUMAN_INTERPRETATION_REQUIRED'],
    },
  } as const;
}

export function finalizeReceivedEvidence(input: {
  pending: PendingEvidenceGrant;
  object: ReceivedEvidenceObject;
  uploaderRole: 'SELLER' | 'BUYER' | 'ENTERPRISE_STATION';
  signer: ManifestSigner;
  bytes?: Buffer;
  digest?: string;
  detectedContentType?: string | null;
}) {
  const digest = input.digest ?? (input.bytes ? sha256Hex(input.bytes) : '');
  if (!digest) throw new Error('finalizeReceivedEvidence requires received bytes or a precomputed digest.');
  const detectedContentType = input.detectedContentType ?? (input.bytes ? detectSupportedMediaType(input.bytes.subarray(0, 32)) : null);
  const contentTypeMatched = detectedContentType === input.object.contentType;
  const clientSha256 = input.pending.clientSha256;
  const clientHashMatched = clientSha256 ? clientSha256 === digest : null;
  const clientSizeBytes = input.pending.clientSizeBytes;
  const clientSizeMatched = clientSizeBytes !== null ? clientSizeBytes === input.object.size : null;
  const attestationStatus = attestationStatusForGrant(input.pending);
  const carrierTrackingMatchStatus = input.pending.carrierContext?.matchStatus ?? 'NOT_SCANNED';
  const clientManifest = input.pending.clientManifest;
  const clientWallDurationMs = clientManifest
    ? Date.parse(String(clientManifest.captureFinishedAt)) - Date.parse(String(clientManifest.captureStartedAt))
    : null;
  const clientMonotonicElapsedMs = typeof clientManifest?.time === 'object' && clientManifest.time && 'monotonicElapsedMs' in clientManifest.time
    ? Number((clientManifest.time as { monotonicElapsedMs?: number }).monotonicElapsedMs)
    : null;
  const clientTimeConsistencyStatus = clientWallDurationMs === null || Number.isNaN(clientWallDurationMs)
    ? 'NOT_PROVIDED'
    : clientMonotonicElapsedMs === null || Number.isNaN(clientMonotonicElapsedMs)
      ? 'NO_MONOTONIC_REFERENCE'
      : Math.abs(clientWallDurationMs - clientMonotonicElapsedMs) <= 5_000
        ? 'CONSISTENT_WITHIN_5_SECONDS'
        : 'INCONSISTENT';
  const assurance = assuranceForFinalization({
    clientManifest,
    attestationStatus,
    clientHashMatched,
    clientSizeMatched,
    contentTypeMatched,
    carrierStatus: carrierTrackingMatchStatus,
    clientTimeConsistencyStatus,
  });
  const runtimeIntegrity = clientManifest && typeof clientManifest.runtimeIntegrity === 'object' && clientManifest.runtimeIntegrity
    ? clientManifest.runtimeIntegrity as { integrityScope?: string | null }
    : null;
  const unsignedManifest = {
    schemaVersion: EVIDENCE_MANIFEST_SCHEMA_VERSION,
    format: {
      canonicalizationProfile: CANONICALIZATION_PROFILE,
      canonicalizationStandard: 'RFC8785_JCS',
      bundleBindingProfile: BUNDLE_BINDING_PROFILE,
    },
    evidence: {
      uploadId: input.pending.uploadId,
      clientEvidenceId: input.pending.clientEvidenceId,
      transactionId: input.pending.transactionId,
      uploaderId: input.pending.uploaderId,
      uploaderRole: input.uploaderRole,
      evidenceType: input.pending.evidenceType,
      acquisitionClass: input.pending.acquisitionClass,
      returnPassportId: input.pending.returnPassportId,
      connectSessionId: input.pending.connectSessionId,
      originalName: input.pending.originalName,
      declaredContentType: input.object.contentType,
      detectedContentType,
      sizeBytes: input.object.size,
      sha256: digest,
      storageGeneration: input.object.generation,
    },
    capture: clientManifest,
    appDeviceContext: input.pending.attestationSnapshot,
    carrierContext: input.pending.carrierContext,
    serverReceipt: {
      bucket: input.object.bucket,
      storagePath: input.object.storagePath,
      storageGeneration: input.object.generation,
      receivedAt: input.object.timeCreated,
      ingressNetwork: input.pending.ingressNetwork,
    },
    verification: {
      serverHashAlgorithm: 'SHA-256',
      clientSha256,
      clientHashMatched,
      clientSizeBytes,
      clientSizeMatched,
      declaredContentType: input.object.contentType,
      detectedContentType,
      contentTypeMatched,
      attestationStatus,
      runtimeIntegrityScope: runtimeIntegrity?.integrityScope ?? null,
      clientWallDurationMs,
      clientMonotonicElapsedMs,
      clientTimeConsistencyStatus,
    },
    assurance,
    governance: {
      accessClass: 'TRANSACTION_PARTICIPANTS',
      retentionPolicyId: 'DEFAULT_UNCONFIGURED',
      legalHoldStatus: 'NOT_EVALUATED',
    },
    authentication: {
      type: 'SERVICE_MAC',
      algorithm: 'HMAC-SHA256',
      keyId: input.signer.keyId,
      verificationScope: 'PACKPROOF_SERVICE_ONLY',
      publicVerificationAvailable: false,
    },
  };
  const manifestJson = canonicalizeJson(unsignedManifest);
  const manifestSha256 = sha256Hex(manifestJson);
  const evidenceBundleSha256 = createEvidenceBundleSha256(digest, manifestSha256);
  const manifestMacBase64url = input.signer.sign(manifestJson);
  const integrityAccepted = clientHashMatched !== false && clientSizeMatched !== false && contentTypeMatched;
  return {
    digest,
    detectedContentType,
    contentTypeMatched,
    clientHashMatched,
    clientSizeMatched,
    attestationStatus,
    assurance,
    carrierTrackingMatchStatus,
    clientTimeConsistencyStatus,
    integrityAccepted,
    manifestJson,
    manifestSha256,
    evidenceBundleSha256,
    manifestMacBase64url,
    acquisitionClass: input.pending.acquisitionClass,
  };
}

export function sha256Bytes(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
