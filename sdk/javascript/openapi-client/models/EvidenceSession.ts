/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EvidenceArtifactType } from './EvidenceArtifactType';
import type { EvidenceSessionStatus } from './EvidenceSessionStatus';
import type { EvidenceSessionType } from './EvidenceSessionType';
import type { ParticipantRole } from './ParticipantRole';
/**
 * Public actor- and purpose-bound acquisition authorization. It is not a claim of evidence authenticity or server finalization. Internal actor IDs, organization ownership, and token digests are excluded.
 */
export type EvidenceSession = {
    id: string;
    object: any;
    schemaVersion: any;
    transactionId: string;
    commerceContextId: string | null;
    returnPassportId: string | null;
    actorRole: ParticipantRole;
    type: EvidenceSessionType;
    protocolVersion: string;
    allowedArtifactTypes: Array<EvidenceArtifactType>;
    status: EvidenceSessionStatus;
    captureState: EvidenceSession.captureState;
    syncState: EvidenceSession.syncState;
    processingState: EvidenceSession.processingState;
    maximumRedemptions: number;
    redemptionCount: number;
    requestedEvidenceCount: number;
    captureProfileId: string | null;
    captureGroupId: string | null;
    expiresAt: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export namespace EvidenceSession {
    export enum captureState {
        NOT_STARTED = 'NOT_STARTED',
        READY = 'READY',
        CAPTURING = 'CAPTURING',
        CAPTURED = 'CAPTURED',
        FAILED = 'FAILED',
        CANCELLED = 'CANCELLED',
    }
    export enum syncState {
        NOT_STARTED = 'NOT_STARTED',
        QUEUED = 'QUEUED',
        UPLOADING = 'UPLOADING',
        AWAITING_FINALIZATION = 'AWAITING_FINALIZATION',
        COMPLETE = 'COMPLETE',
        FAILED_RETRYABLE = 'FAILED_RETRYABLE',
        FAILED_TERMINAL = 'FAILED_TERMINAL',
    }
    export enum processingState {
        NOT_STARTED = 'NOT_STARTED',
        PROCESSING = 'PROCESSING',
        COMPLETE = 'COMPLETE',
        QUARANTINED = 'QUARANTINED',
        FAILED = 'FAILED',
    }
}

