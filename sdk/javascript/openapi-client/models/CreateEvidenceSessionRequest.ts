/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EvidenceArtifactType } from './EvidenceArtifactType';
import type { EvidenceSessionType } from './EvidenceSessionType';
export type CreateEvidenceSessionRequest = {
    schemaVersion: any;
    participantClaimId: string;
    type: EvidenceSessionType;
    allowedArtifactTypes: Array<EvidenceArtifactType>;
    expiresInSeconds?: number;
    maximumRedemptions?: number;
    requestedEvidenceCount?: number;
    captureProfileId?: string | null;
    captureGroupId?: string | null;
};

