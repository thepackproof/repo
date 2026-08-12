/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ParticipantClaimInstructions = {
    state: any;
    /**
     * Short-lived handoff URL. The URL alone grants no read access and does not replace Firebase user authentication or App Check.
     */
    claimUrl: string;
    token: string;
    expiresAt: string;
};

