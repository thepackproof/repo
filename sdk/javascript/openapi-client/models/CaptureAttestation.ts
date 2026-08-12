/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A bounded nonce for the existing native capture pipeline. It proves successful authorization issuance, not that evidence was captured, uploaded, or finalized.
 */
export type CaptureAttestation = {
    mode: any;
    captureSessionId: string;
    nonce: string;
    appId: string;
    issuedAt: string;
    captureWindowEndsAt: string;
    tokenReplayDetected: any;
    reasonCodes: Array<string>;
    sessionMode: CaptureAttestation.sessionMode;
    maxEvidenceCount: number;
    captureGroupId: string | null;
};
export namespace CaptureAttestation {
    export enum sessionMode {
        SINGLE = 'SINGLE',
        BATCH = 'BATCH',
    }
}

