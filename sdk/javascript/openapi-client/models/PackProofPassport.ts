/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PassportComparison } from './PassportComparison';
import type { PassportFact } from './PassportFact';
import type { PassportInventoryEntry } from './PassportInventoryEntry';
import type { PassportProvenanceClass } from './PassportProvenanceClass';
/**
 * Canonical Proof (Passport projection). Web/API JSON is the Proof. PDF is a presentation export of a frozen snapshot. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
 */
export type PackProofPassport = {
    object: any;
    schemaVersion: any;
    identity: {
        passportId: string;
        displayId: string;
        schemaVersion: any;
        rendererCompatibility: any;
        transactionId: string;
        state: any;
        issuedAt: string;
        sourceUpdatedAt: string;
        merchantPlatform: string | null;
        externalOrderId: string | null;
        verificationUrl: string;
        qrPayload: string;
    };
    integrity: {
        banner: PackProofPassport.banner;
        summary: PackProofPassport.summary;
        meaning: string;
        criteria: {
            passportRecord: PackProofPassport.passportRecord;
            evidenceManifests: PackProofPassport.evidenceManifests;
            evidenceFileDigests: PackProofPassport.evidenceFileDigests;
            bundleBindings: PackProofPassport.bundleBindings;
            finalization: PackProofPassport.finalization;
            provenance: PackProofPassport.provenance;
            evidenceLineage: PackProofPassport.evidenceLineage;
        };
        manifestAuthentication: {
            type: PackProofPassport.type;
            algorithm: PackProofPassport.algorithm;
            verificationScope: any;
            keyId: string | null;
            publiclyVerifiable: any;
        };
        canonicalizationProfile: any;
        bundleBindingProfile: PackProofPassport.bundleBindingProfile;
    };
    transaction: {
        commerceContextId: string | null;
        platform: PassportFact;
        externalOrderId: PassportFact;
        transactionDate: PassportFact;
        amount: PassportFact;
        sellerReference: PassportFact;
        destination: PassportFact;
        itemCount: PassportFact;
        sourceTrustClass: PackProofPassport.sourceTrustClass;
        importedAt: string | null;
        canonicalPayloadSha256: string | null;
    };
    items: Array<{
        index: number;
        expected: {
            title: PassportFact;
            sku: PassportFact;
            gtin: PassportFact;
            upc: PassportFact;
            variant: PassportFact;
            quantity: PassportFact;
            declaredCondition: PassportFact;
            serialExpected: PassportFact;
            merchantItemId: PassportFact;
            listingReference: PassportFact;
        };
        observations: Array<{
            kind: 'ITEM_CAPTURED' | 'BARCODE_OBSERVED' | 'SERIAL_OBSERVED' | 'QUANTITY_OBSERVED' | 'CONDITION_IMAGERY' | 'PACKING_CAPTURE' | 'PACKAGE_INTERIOR' | 'SEAL_EVENT' | 'SHIPPING_LABEL' | 'TRACKING_OBSERVED' | 'WEIGHT' | 'APP_DEVICE_CONTEXT';
            result: PassportFact;
            artifactId: string | null;
            evidenceSessionId: string | null;
            frameReference: string | null;
            capturedAt: string | null;
        }>;
        comparisons: Array<PassportComparison>;
    }>;
    fulfillment: {
        captureSessionId: string | null;
        packingArtifactId: string | null;
        sealArtifactId: string | null;
        labelArtifactId: string | null;
        trackingObserved: PassportFact;
        shippingTracker: PassportFact;
    };
    shipment: ({
        carrier: PassportFact;
        trackingSupplied: PassportFact;
        trackingObserved: PassportFact;
        trackingThirdParty: PassportFact;
        labelObservedByPackProof: boolean;
        associatedAt: string | null;
        packingEvidenceId: string | null;
        sealEvidenceId: string | null;
    } | null);
    delivery: ({
        carrier: PassportFact;
        trackingNumber: PassportFact;
        receivedAt: PassportFact;
        arrivalArtifactId: string | null;
        signatureAvailable: any;
        deliveryPhotoAvailable: boolean;
    } | null);
    receiver: ({
        arrivalArtifactId: string | null;
        unboxingArtifactId: string | null;
        observedAt: string | null;
    } | null);
    returns: Array<{
        returnPassportId: string;
        status: string;
        reason: string | null;
        packingArtifactId: string | null;
        sealArtifactId: string | null;
        trackingSupplied: PassportFact;
    }>;
    evidenceInventory: Array<PassportInventoryEntry>;
    artifacts: Array<{
        artifactId: string;
        type: string;
        source: 'PACKPROOF_CAPTURE' | 'ENTERPRISE_EDGE' | 'EXTERNAL_DECLARED' | 'UNKNOWN';
        capturedAt: string | null;
        finalizedAt: string | null;
        contentType: string | null;
        sizeBytes: number | null;
        sha256: string | null;
        manifestSha256: string | null;
        evidenceBundleSha256: string | null;
        finalization: 'FINALIZED' | 'QUARANTINED' | 'FAILED' | 'UPLOADED' | 'RESERVED';
        evidenceSessionId: string | null;
        shippingTracker: any | null;
    }>;
    timeline: Array<{
        eventId: string;
        occurredAt: string;
        source: string;
        provenanceClass: PassportProvenanceClass;
        title: string;
        evidenceReference: string | null;
    }>;
    reviewContext: ({
        receivingFramework: string;
        disputeCategory: string;
        relevance: Array<{
            category: string;
            inventoryState: 'AVAILABLE' | 'NOT_AVAILABLE' | 'NOT_APPLICABLE' | 'REVIEW_REQUIRED';
        }>;
        footnote: any;
    } | null);
    provenance: Array<{
        field: string;
        value: any;
        provenanceClass: PassportProvenanceClass;
        assertingSource: string | null;
        trustClass: string | null;
        recordedAt: string | null;
        sourceRecordId: string | null;
        sourceReference: string | null;
        digestSha256: string | null;
    }>;
    limitations: {
        physicalCorrespondence: any;
        businessLegalRelevance: any;
        doesNotAuthenticateItem: any;
        doesNotProveCustody: any;
        doesNotDecideFraudOrFault: any;
        doesNotGuaranteeDisputeOutcome: any;
        absenceOfEvidenceDoesNotAffectAuthenticity: any;
        noEvidentiaryWeightScore: any;
        presentationExportIsNotSource: any;
        manifestAuthenticationScope: any;
        shippingTrackerInterpretation: any;
        humanReviewDisclaimer: string;
    };
    createdAt: string;
    updatedAt: string;
};
export namespace PackProofPassport {
    export enum banner {
        AUTHENTIC_PACKPROOF = 'AUTHENTIC_PACKPROOF',
        PACKPROOF_RECORD_WITH_LIMITATIONS = 'PACKPROOF_RECORD_WITH_LIMITATIONS',
    }
    export enum summary {
        PACK_PROOF_RECORD_INTEGRITY_VERIFIED = 'PackProof record integrity verified',
        PACK_PROOF_RECORD_INTEGRITY_VERIFIED_WITH_RECORDED_LIMITATIONS = 'PackProof record integrity verified with recorded limitations',
    }
    export enum passportRecord {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum evidenceManifests {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum evidenceFileDigests {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum bundleBindings {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum finalization {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum provenance {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum evidenceLineage {
        VERIFIED = 'VERIFIED',
        RECORDED = 'RECORDED',
        LIMITED = 'LIMITED',
        FAILED = 'FAILED',
    }
    export enum type {
        SERVICE_MAC = 'SERVICE_MAC',
        LEGACY_SERVICE_MAC = 'LEGACY_SERVICE_MAC',
    }
    export enum algorithm {
        HMAC_SHA256 = 'HMAC-SHA256',
    }
    export enum bundleBindingProfile {
        PACKPROOF_EVIDENCE_BUNDLE_V2 = 'PACKPROOF_EVIDENCE_BUNDLE_V2',
        LEGACY_V1 = 'LEGACY_V1',
    }
    export enum sourceTrustClass {
        MERCHANT_SERVER_ATTESTED = 'MERCHANT_SERVER_ATTESTED',
        PLATFORM_API_ATTESTED = 'PLATFORM_API_ATTESTED',
        USER_PROVIDED_COMMERCE_ARTIFACT = 'USER_PROVIDED_COMMERCE_ARTIFACT',
        PAGE_DECLARED = 'PAGE_DECLARED',
    }
}

