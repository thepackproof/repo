/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type TransactionWorkspace = {
    schemaVersion: any;
    projectionVersion: string;
    transactionId: string;
    sourceTransactionRevision: string;
    viewer: {
        actorId: string;
        role: TransactionWorkspace.role;
    };
    lifecycle: Record<string, any>;
    protocol: Record<string, any>;
    evidenceProcessing: Record<string, any>;
    nextAction: Record<string, any>;
    proof: {
        availability: TransactionWorkspace.availability;
        passportId: string | null;
        displayId: string | null;
    };
    returnWorkflow: any | null;
    display?: Record<string, any>;
    generatedAt: string;
};
export namespace TransactionWorkspace {
    export enum role {
        SELLER = 'SELLER',
        BUYER = 'BUYER',
    }
    export enum availability {
        NOT_ELIGIBLE = 'NOT_ELIGIBLE',
        ELIGIBLE_NOT_ISSUED = 'ELIGIBLE_NOT_ISSUED',
        AVAILABLE = 'AVAILABLE',
    }
}

