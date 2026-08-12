/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EvidenceSessionRedemptionInstructions = {
    state: any;
    /**
     * Short-lived native-app handoff. Possession alone grants no session read or redemption authority.
     */
    redemptionUrl: string;
    token: string;
    expiresAt: string;
};

