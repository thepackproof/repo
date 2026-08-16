/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ReturnPassport = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    reason: string;
    status: string;
    originalEvidenceHashes: Array<string>;
    shippingCarrier: string | null;
    shippingTrackingNumber: string | null;
    packingEvidenceId: string | null;
    sealEvidenceId: string | null;
    labelEvidenceMatchStatus: ReturnPassport.labelEvidenceMatchStatus;
    createdAt: string;
    updatedAt: string;
};
export namespace ReturnPassport {
    export enum labelEvidenceMatchStatus {
        MATCHED = 'MATCHED',
        MISMATCH = 'MISMATCH',
        NOT_SCANNED = 'NOT_SCANNED',
    }
}

