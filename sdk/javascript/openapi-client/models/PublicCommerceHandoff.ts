/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type PublicCommerceHandoff = {
    id: string;
    object: any;
    schemaVersion: any;
    commerceContextId: string;
    passportDraftId: string;
    trustLevel: any;
    status: any;
    /**
     * Short-lived bearer handoff URL. Do not log, persist, or send it to third parties.
     */
    reviewUrl: string;
    expiresAt: string;
};

