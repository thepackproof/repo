/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssuranceAssessment } from './AssuranceAssessment';
import type { ConnectManifestAuthentication } from './ConnectManifestAuthentication';
/**
 * Inbound Connect callback. Verify the HMAC over the exact raw body before parsing. dossierUrl is added at delivery time and expires after 15 minutes.
 */
export type EvidenceFinalizedCallback = {
    event: any;
    orderId: string;
    trackingNumber?: string | null;
    evidenceStatus: EvidenceFinalizedCallback.evidenceStatus;
    statusReasonCodes: Array<'SERVER_FINALIZATION_NOT_RECORDED' | 'STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE' | 'CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED' | 'CLIENT_SERVER_SIZE_MATCH_NOT_ESTABLISHED' | 'DECLARED_MEDIA_TYPE_MATCH_NOT_ESTABLISHED' | 'CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED' | 'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE' | 'BUSINESS_LEGAL_REVIEW_REQUIRED'>;
    fileSha256: string;
    /**
     * Compatibility alias for fileSha256.
     * @deprecated
     */
    sha256Hash?: string;
    manifestSha256: string | null;
    evidenceBundleSha256: string | null;
    manifestAuthentication: ConnectManifestAuthentication;
    assurance: (AssuranceAssessment | null);
    attestationStatus?: string;
    carrierTrackingMatchStatus?: string;
    declaredWeightGrams?: number | null;
    dossierUrl: string;
    dossierUrlExpiresAt: string;
    dossierSha256: string;
    timestamp: string;
};
export namespace EvidenceFinalizedCallback {
    export enum evidenceStatus {
        DIGITAL_EVIDENCE_READY = 'DIGITAL_EVIDENCE_READY',
        DIGITAL_EVIDENCE_WITH_LIMITATIONS = 'DIGITAL_EVIDENCE_WITH_LIMITATIONS',
    }
}

