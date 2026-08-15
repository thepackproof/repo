/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Merchant-asserted tracking context. It is not carrier custody proof.
 */
export type Shipment = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    carrier: string;
    trackingNumber: string;
    assertionSource: any;
    status: Shipment.status;
    packingEvidenceId: string | null;
    sealEvidenceId: string | null;
    labelEvidenceMatchStatus: Shipment.labelEvidenceMatchStatus;
    shippedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export namespace Shipment {
    export enum status {
        ASSOCIATED = 'ASSOCIATED',
        IN_TRANSIT = 'IN_TRANSIT',
    }
    export enum labelEvidenceMatchStatus {
        MATCHED = 'MATCHED',
        MISMATCH = 'MISMATCH',
        NOT_SCANNED = 'NOT_SCANNED',
    }
}

