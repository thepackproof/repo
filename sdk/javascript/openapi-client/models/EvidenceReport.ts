/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * A presentation-only dossier. Native evidence and manifests remain the source records.
 */
export type EvidenceReport = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    status: any;
    reportSha256: string;
    evidenceCount: number;
    presentationOnly: any;
    generatedAt: string;
    downloadUrl: string | null;
    downloadUrlExpiresAt: string | null;
};

