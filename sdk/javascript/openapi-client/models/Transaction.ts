/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Amount } from './Amount';
import type { CaptureRequirements } from './CaptureRequirements';
import type { ParticipantReference } from './ParticipantReference';
import type { TransactionStatus } from './TransactionStatus';
export type Transaction = {
    id: string;
    object: any;
    merchantReference: string;
    title: string;
    description: string;
    category: string | null;
    amount: (Amount | null);
    participants: Array<ParticipantReference>;
    captureRequirements: CaptureRequirements;
    status: TransactionStatus;
    captureStatus: Transaction.captureStatus;
    shipmentStatus: Transaction.shipmentStatus;
    receiverStatus: Transaction.receiverStatus;
    returnStatus: Transaction.returnStatus;
    verificationStatus: Transaction.verificationStatus;
    createdAt: string;
    updatedAt: string;
};
export namespace Transaction {
    export enum captureStatus {
        NOT_STARTED = 'NOT_STARTED',
        IN_PROGRESS = 'IN_PROGRESS',
        COMPLETE = 'COMPLETE',
    }
    export enum shipmentStatus {
        NOT_ASSOCIATED = 'NOT_ASSOCIATED',
        ASSOCIATED = 'ASSOCIATED',
    }
    export enum receiverStatus {
        NOT_STARTED = 'NOT_STARTED',
        IN_PROGRESS = 'IN_PROGRESS',
        COMPLETE = 'COMPLETE',
    }
    export enum returnStatus {
        NOT_STARTED = 'NOT_STARTED',
        IN_PROGRESS = 'IN_PROGRESS',
        COMPLETE = 'COMPLETE',
    }
    export enum verificationStatus {
        PENDING_EVIDENCE = 'PENDING_EVIDENCE',
        PENDING = 'PENDING',
        PROCESSING = 'PROCESSING',
        COMPLETE = 'COMPLETE',
    }
}

