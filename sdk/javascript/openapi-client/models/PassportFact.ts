/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PassportProvenanceClass } from './PassportProvenanceClass';
export type PassportFact = {
    value: any;
    provenanceClass: PassportProvenanceClass;
    assertingSource: string | null;
    trustClass: PassportFact.trustClass;
    recordedAt: string | null;
    sourceRecordId: string | null;
    sourceReference: string | null;
    digestSha256: string | null;
};
export namespace PassportFact {
    export enum trustClass {
        MERCHANT_SERVER_ATTESTED = 'MERCHANT_SERVER_ATTESTED',
        PLATFORM_API_ATTESTED = 'PLATFORM_API_ATTESTED',
        PAGE_DECLARED = 'PAGE_DECLARED',
        PACKPROOF_CAPTURE = 'PACKPROOF_CAPTURE',
        PACKPROOF_SERVICE = 'PACKPROOF_SERVICE',
    }
}

