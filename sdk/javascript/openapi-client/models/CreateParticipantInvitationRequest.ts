/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ParticipantRole } from './ParticipantRole';
export type CreateParticipantInvitationRequest = {
    schemaVersion: any;
    role: ParticipantRole;
    /**
     * Must exactly match the merchant-declared participant reference for this role. It remains non-authorizing and is not returned by the API.
     */
    externalReference: string;
    expiresInSeconds?: number;
};

