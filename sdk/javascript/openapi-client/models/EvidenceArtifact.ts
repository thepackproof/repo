/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssuranceAssessment } from './AssuranceAssessment';
import type { ShippingTrackerObservation } from './ShippingTrackerObservation';
export type EvidenceArtifact = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    type: string;
    status: EvidenceArtifact.status;
    role: EvidenceArtifact.role;
    contentType: string | null;
    sizeBytes: number | null;
    sha256: string | null;
    manifestSha256: string | null;
    evidenceBundleSha256: string | null;
    manifestAuthenticationScope: EvidenceArtifact.manifestAuthenticationScope;
    workflowReady: boolean;
    assurance: (AssuranceAssessment | null);
    carrierTrackingMatchStatus: string | null;
    /**
     * Present when a shipping barcode was observed at capture. Null for artifacts without an open-source tracker observation.
     */
    shippingTracker?: (ShippingTrackerObservation | null);
    finalizedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export namespace EvidenceArtifact {
    export enum status {
        RESERVED = 'RESERVED',
        UPLOADED = 'UPLOADED',
        FINALIZED = 'FINALIZED',
        QUARANTINED = 'QUARANTINED',
        FAILED = 'FAILED',
    }
    export enum role {
        SELLER = 'SELLER',
        BUYER = 'BUYER',
        RECEIVER = 'RECEIVER',
        RETURN_SENDER = 'RETURN_SENDER',
        RETURN_RECIPIENT = 'RETURN_RECIPIENT',
        WITNESS = 'WITNESS',
    }
    export enum manifestAuthenticationScope {
        PACKPROOF_SERVICE_ONLY = 'PACKPROOF_SERVICE_ONLY',
    }
}

