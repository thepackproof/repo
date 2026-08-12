/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ParticipantClaimStatus } from './ParticipantClaimStatus';
import type { ParticipantRole } from './ParticipantRole';
/**
 * Public participant-claim projection. External references, actor identifiers, token digests, and internal ownership fields are intentionally excluded.
 */
export type ParticipantClaim = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    role: ParticipantRole;
    status: ParticipantClaimStatus;
    expiresAt: string;
    claimedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

