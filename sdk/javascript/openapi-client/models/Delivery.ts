/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Merchant-asserted inbound delivery context linked to an arrival photograph. It is not carrier custody proof.
 */
export type Delivery = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    assertionSource: any;
    status: any;
    arrivalEvidenceId: string;
    carrier: string | null;
    trackingNumber: string | null;
    labelEvidenceMatchStatus: Delivery.labelEvidenceMatchStatus;
    receivedAt: string;
    createdAt: string;
    updatedAt: string;
};
export namespace Delivery {
    export enum labelEvidenceMatchStatus {
        MATCHED = 'MATCHED',
        MISMATCH = 'MISMATCH',
        NOT_SCANNED = 'NOT_SCANNED',
    }
}

