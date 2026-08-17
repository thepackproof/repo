export const connectEvidenceStatuses = [
  'DIGITAL_EVIDENCE_READY',
  'DIGITAL_EVIDENCE_WITH_LIMITATIONS',
] as const;
export type ConnectEvidenceStatus = (typeof connectEvidenceStatuses)[number];

export const connectEvidenceStatusReasonCodes = [
  'SERVER_FINALIZATION_NOT_RECORDED',
  'STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE',
  'CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED',
  'CLIENT_SERVER_SIZE_MATCH_NOT_ESTABLISHED',
  'DECLARED_MEDIA_TYPE_MATCH_NOT_ESTABLISHED',
  'CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED',
  'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
  'BUSINESS_LEGAL_REVIEW_REQUIRED',
] as const;
export type ConnectEvidenceStatusReasonCode = (typeof connectEvidenceStatusReasonCodes)[number];

export const strongestAppDeviceContextStatuses = [
  'ONLINE_APP_CHECK_AND_KEY_POSSESSION',
  'JIT_VERIFIED',
] as const;

export const connectAcquisitionProfiles = {
  NATIVE_MOBILE: {
    strongestAttestation: strongestAppDeviceContextStatuses,
  },
  ENTERPRISE_EDGE: {
    strongestAttestation: ['ENTERPRISE_EDGE_CERTIFICATE'] as const,
    additionalRequirements: ['station binding', 'registered device', 'session capability'] as const,
  },
  EXTERNAL_DECLARED: {
    strongestAttestation: [] as const,
  },
} as const;

export type ConnectManifestAuthentication = {
  type: 'SERVICE_MAC' | 'LEGACY_SERVICE_MAC';
  algorithm?: 'HMAC-SHA256';
  keyId?: string;
  macBase64url: string | null;
  verificationScope: 'PACKPROOF_SERVICE_ONLY';
};

export type ConnectEvidenceFinalizedCallback = {
  event: 'packproof.evidence.finalized';
  orderId: string;
  trackingNumber: string | null;
  evidenceStatus: ConnectEvidenceStatus;
  statusReasonCodes: ConnectEvidenceStatusReasonCode[];
  fileSha256: string;
  sha256Hash: string;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  manifestAuthentication: ConnectManifestAuthentication;
  assurance: Record<string, unknown> | null;
  attestationStatus: string;
  carrierTrackingMatchStatus: string;
  declaredWeightGrams: number | null;
  dossierSha256: string;
};

export type ConnectEvidenceFinalizedInput = {
  orderId: string;
  trackingNumber: string | null;
  fileSha256: string;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  manifestAuthentication?: Partial<ConnectManifestAuthentication> | null;
  legacyManifestMac?: string | null;
  assurance: Record<string, unknown> | null;
  attestationStatus: string;
  carrierTrackingMatchStatus: string | null;
  declaredWeightGrams: number | null;
  dossierSha256: string;
  serverFinalized: boolean;
  clientHashMatched: boolean | null;
  clientSizeMatched: boolean | null;
  contentTypeMatched: boolean | null;
  trackingNumberWasSupplied: boolean;
  byteIntegrityStatus?: string | null;
};

export function connectEvidenceIsReady(input: ConnectEvidenceFinalizedInput): boolean {
  const trackingSatisfied = input.trackingNumberWasSupplied
    ? input.carrierTrackingMatchStatus === 'MATCHED'
    : input.carrierTrackingMatchStatus !== 'MISMATCH';
  return input.serverFinalized === true
    && strongestAppDeviceContextStatuses.includes(input.attestationStatus as (typeof strongestAppDeviceContextStatuses)[number])
    && input.clientHashMatched === true
    && input.clientSizeMatched === true
    && input.contentTypeMatched === true
    && input.byteIntegrityStatus !== 'MISMATCH'
    && trackingSatisfied;
}

export function connectEvidenceReasonCodes(input: ConnectEvidenceFinalizedInput): ConnectEvidenceStatusReasonCode[] {
  const trackingSatisfied = input.trackingNumberWasSupplied
    ? input.carrierTrackingMatchStatus === 'MATCHED'
    : input.carrierTrackingMatchStatus !== 'MISMATCH';
  return [
    ...(input.serverFinalized === true ? [] : ['SERVER_FINALIZATION_NOT_RECORDED' as const]),
    ...(strongestAppDeviceContextStatuses.includes(input.attestationStatus as (typeof strongestAppDeviceContextStatuses)[number])
      ? []
      : ['STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE' as const]),
    ...(input.clientHashMatched === true ? [] : ['CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED' as const]),
    ...(input.clientSizeMatched === true ? [] : ['CLIENT_SERVER_SIZE_MATCH_NOT_ESTABLISHED' as const]),
    ...(input.contentTypeMatched === true ? [] : ['DECLARED_MEDIA_TYPE_MATCH_NOT_ESTABLISHED' as const]),
    ...(trackingSatisfied ? [] : ['CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED' as const]),
    'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
    'BUSINESS_LEGAL_REVIEW_REQUIRED',
  ];
}

function manifestAuthentication(input: ConnectEvidenceFinalizedInput): ConnectManifestAuthentication {
  const supplied = input.manifestAuthentication;
  if (supplied && supplied.type === 'SERVICE_MAC' && supplied.macBase64url) {
    return {
      type: 'SERVICE_MAC',
      algorithm: 'HMAC-SHA256',
      keyId: supplied.keyId,
      macBase64url: supplied.macBase64url,
      verificationScope: 'PACKPROOF_SERVICE_ONLY',
    };
  }
  return {
    type: 'LEGACY_SERVICE_MAC',
    macBase64url: typeof supplied?.macBase64url === 'string'
      ? supplied.macBase64url
      : input.legacyManifestMac ?? null,
    verificationScope: 'PACKPROOF_SERVICE_ONLY',
  };
}

export function buildConnectEvidenceFinalizedCallback(input: ConnectEvidenceFinalizedInput): ConnectEvidenceFinalizedCallback {
  const evidenceStatus = connectEvidenceIsReady(input) ? 'DIGITAL_EVIDENCE_READY' : 'DIGITAL_EVIDENCE_WITH_LIMITATIONS';
  return {
    event: 'packproof.evidence.finalized',
    orderId: input.orderId,
    trackingNumber: input.trackingNumber,
    evidenceStatus,
    statusReasonCodes: connectEvidenceReasonCodes(input),
    fileSha256: input.fileSha256,
    sha256Hash: input.fileSha256,
    manifestSha256: input.manifestSha256,
    evidenceBundleSha256: input.evidenceBundleSha256,
    manifestAuthentication: manifestAuthentication(input),
    assurance: input.assurance,
    attestationStatus: input.attestationStatus,
    carrierTrackingMatchStatus: input.carrierTrackingMatchStatus ?? 'NOT_SCANNED',
    declaredWeightGrams: input.declaredWeightGrams,
    dossierSha256: input.dossierSha256,
  };
}
