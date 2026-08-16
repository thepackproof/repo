/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * PENDING_REDEMPTION is the issued handoff. READY_FOR_CAPTURE means the seller redeemed the session and a transaction exists. EXPIRED is computed on read when PENDING_REDEMPTION is past expiresAt. CANCELLED is an explicit merchant revoke of an unredeemed session.
 */
export enum ConnectSessionStatus {
    PENDING_REDEMPTION = 'PENDING_REDEMPTION',
    READY_FOR_CAPTURE = 'READY_FOR_CAPTURE',
    CANCELLED = 'CANCELLED',
    EXPIRED = 'EXPIRED',
}
