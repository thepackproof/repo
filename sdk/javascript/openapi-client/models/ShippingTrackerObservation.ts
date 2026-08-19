/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Open-source tracking-number identification and canonical observation hash. This is checksum and courier identification from published tracking-number data, not live carrier custody.
 */
export type ShippingTrackerObservation = {
    lookupStatus: ShippingTrackerObservation.lookupStatus;
    courierCode: string | null;
    courierName: string | null;
    publicTrackingUrl: string | null;
    stillSha256: string | null;
    stillCaptureStatus: ShippingTrackerObservation.stillCaptureStatus;
    observationSha256: string;
    clientObservationSha256: string | null;
    hashMatched: boolean | null;
    interpretation: any;
};
export namespace ShippingTrackerObservation {
    export enum lookupStatus {
        DATASET_VALIDATED = 'DATASET_VALIDATED',
        UNRECOGNIZED = 'UNRECOGNIZED',
        LOOKUP_INCOMPLETE = 'LOOKUP_INCOMPLETE',
    }
    export enum stillCaptureStatus {
        CAPTURED = 'CAPTURED',
        FAILED = 'FAILED',
        UNAVAILABLE_WHILE_RECORDING = 'UNAVAILABLE_WHILE_RECORDING',
        NOT_ATTEMPTED = 'NOT_ATTEMPTED',
    }
}

