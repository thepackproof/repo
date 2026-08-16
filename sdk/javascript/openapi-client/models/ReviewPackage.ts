/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Amount } from './Amount';
import type { Delivery } from './Delivery';
import type { EvidenceArtifact } from './EvidenceArtifact';
import type { ReturnPassport } from './ReturnPassport';
import type { Shipment } from './Shipment';
import type { TimelineEvent } from './TimelineEvent';
export type ReviewPackage = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    title: string;
    merchantReference: string | null;
    status: string;
    amount: (Amount | null);
    terms: any | null;
    protocolCompleteness: {
        sellerPackingVideo: ReviewPackage.sellerPackingVideo;
        sellerSealReference: ReviewPackage.sellerSealReference;
        buyerArrivalObservation: ReviewPackage.buyerArrivalObservation;
        buyerUnboxing: ReviewPackage.buyerUnboxing;
        returnPackingVideo: ReviewPackage.returnPackingVideo;
        returnSealReference: ReviewPackage.returnSealReference;
    };
    documentationCategories: Array<{
        category: 'TERMS_AND_CONDITIONS' | 'ITEM_AND_ORDER_DESCRIPTION' | 'PACKING_AND_SEAL_REFERENCE' | 'ARRIVAL_OR_DELIVERY_OBSERVATION' | 'RETURN_DOCUMENTATION' | 'HASHED_EVIDENCE_INVENTORY' | 'AUDIT_TIMELINE';
        present: boolean;
        artifactIds: Array<string>;
    }>;
    evidence: Array<EvidenceArtifact>;
    shipment: (Shipment | null);
    delivery: (Delivery | null);
    returns: Array<ReturnPassport>;
    latestReport: any | null;
    timeline: Array<TimelineEvent>;
    limitations: {
        physicalCorrespondence: any;
        businessLegalRelevance: any;
        doesNotAuthenticateItem: any;
        doesNotProveCustody: any;
        doesNotDecideFraudOrFault: any;
        doesNotGuaranteeDisputeOutcome: any;
        dossierIsPresentationOnly: any;
        manifestAuthenticationScope: any;
        humanReviewDisclaimer: string;
    };
    createdAt: string;
    updatedAt: string;
};
export namespace ReviewPackage {
    export enum sellerPackingVideo {
        ABSENT = 'ABSENT',
        PRESENT = 'PRESENT',
        PRESENT_WITH_LIMITATIONS = 'PRESENT_WITH_LIMITATIONS',
    }
    export enum sellerSealReference {
        ABSENT = 'ABSENT',
        PRESENT = 'PRESENT',
        PRESENT_WITH_LIMITATIONS = 'PRESENT_WITH_LIMITATIONS',
    }
    export enum buyerArrivalObservation {
        ABSENT = 'ABSENT',
        PRESENT = 'PRESENT',
        PRESENT_WITH_LIMITATIONS = 'PRESENT_WITH_LIMITATIONS',
    }
    export enum buyerUnboxing {
        ABSENT = 'ABSENT',
        PRESENT = 'PRESENT',
        PRESENT_WITH_LIMITATIONS = 'PRESENT_WITH_LIMITATIONS',
    }
    export enum returnPackingVideo {
        ABSENT = 'ABSENT',
        PRESENT = 'PRESENT',
        PRESENT_WITH_LIMITATIONS = 'PRESENT_WITH_LIMITATIONS',
    }
    export enum returnSealReference {
        ABSENT = 'ABSENT',
        PRESENT = 'PRESENT',
        PRESENT_WITH_LIMITATIONS = 'PRESENT_WITH_LIMITATIONS',
    }
}

