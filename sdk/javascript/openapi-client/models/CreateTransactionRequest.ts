/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Amount } from './Amount';
import type { CaptureRequirements } from './CaptureRequirements';
import type { ParticipantReference } from './ParticipantReference';
export type CreateTransactionRequest = {
    merchantReference: string;
    title: string;
    description?: string;
    category?: string;
    amount?: Amount;
    participants?: Array<ParticipantReference>;
    captureRequirements?: CaptureRequirements;
};

