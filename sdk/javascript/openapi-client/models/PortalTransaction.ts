/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PortalProtocol } from './PortalProtocol';
export type PortalTransaction = {
    id: string;
    object: any;
    schemaVersion: any;
    viewerRole: PortalTransaction.viewerRole;
    hasBuyer: boolean;
    viewerConfirmed: boolean;
    viewerHandoffConfirmed: boolean;
    viewerCompleted: boolean;
    counterpartyConfirmed: boolean;
    counterpartyHandoffConfirmed: boolean;
    counterpartyCompleted: boolean;
    status: string;
    title: string;
    category: string;
    description: string;
    priceMinor: number | null;
    currency: string | null;
    identifiers: Array<{
        label: string;
        value: string;
    }>;
    conditionNotes: string;
    terms: any | null;
    passportId: string | null;
    passportDisplayId: string | null;
    /**
     * Canonical Proof retrievability from evaluatePassportEligibility. Presentation surfaces must not infer this from lifecycle status.
     */
    proofReady: boolean;
    source: any | null;
    protocol: PortalProtocol;
    lockedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export namespace PortalTransaction {
    export enum viewerRole {
        SELLER = 'SELLER',
        BUYER = 'BUYER',
    }
}

