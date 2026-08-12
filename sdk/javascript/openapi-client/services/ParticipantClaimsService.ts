/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ClaimParticipantRequest } from '../models/ClaimParticipantRequest';
import type { CreateParticipantInvitationRequest } from '../models/CreateParticipantInvitationRequest';
import type { ParticipantClaimResponse } from '../models/ParticipantClaimResponse';
import type { ParticipantInvitationResponse } from '../models/ParticipantInvitationResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ParticipantClaimsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay a participant invitation
     * Issues a short-lived, one-time claim capability for a participant reference already declared on this merchant transaction. The external reference is a non-authorizing merchant label: only a successful claim made by an authenticated PackProof user binds an actor to the role. The plaintext token is returned only in this response and is stored by PackProof only as a digest.
     * @returns ParticipantInvitationResponse The original invitation and token for an exact idempotent retry.
     * @throws ApiError
     */
    public createParticipantInvitation({
        transactionId,
        idempotencyKey,
        requestBody,
    }: {
        transactionId: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreateParticipantInvitationRequest,
    }): CancelablePromise<ParticipantInvitationResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/participant-invitations',
            path: {
                'transactionId': transactionId,
            },
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                413: `The request body exceeded 256 KiB.`,
                415: `The request Content-Type is unsupported.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Claim a declared transaction role
     * Binds the authenticated PackProof user to the invitation's transaction role after validating the one-time claim token. Firebase App Check augments, but never replaces, Firebase user identity. Possession of a claim link alone provides no transaction read authority.
     * @returns ParticipantClaimResponse The same authenticated actor replayed an already completed claim.
     * @throws ApiError
     */
    public claimParticipantInvitation({
        requestBody,
    }: {
        requestBody: ClaimParticipantRequest,
    }): CancelablePromise<ParticipantClaimResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/participant-claims',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                413: `The request body exceeded 256 KiB.`,
                415: `The request Content-Type is unsupported.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
}
