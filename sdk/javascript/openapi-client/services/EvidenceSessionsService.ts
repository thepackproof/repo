/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelEvidenceSessionRequest } from '../models/CancelEvidenceSessionRequest';
import type { CreateEvidenceSessionRequest } from '../models/CreateEvidenceSessionRequest';
import type { CreateEvidenceSessionResponse } from '../models/CreateEvidenceSessionResponse';
import type { EvidenceSessionResponse } from '../models/EvidenceSessionResponse';
import type { RedeemEvidenceSessionRequest } from '../models/RedeemEvidenceSessionRequest';
import type { RedeemEvidenceSessionResponse } from '../models/RedeemEvidenceSessionResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class EvidenceSessionsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay an actor-bound evidence session
     * Creates a bounded capture authorization for an already claimed participant: transaction, actor, role, purpose, artifact types, capture profile, expiry, and redemption count are fixed by the server. Creation authorizes acquisition only; it does not establish evidence authenticity, physical correspondence, or finalization.
     * @returns CreateEvidenceSessionResponse The original evidence session and token for an exact idempotent retry.
     * @throws ApiError
     */
    public createEvidenceSession({
        transactionId,
        idempotencyKey,
        requestBody,
    }: {
        transactionId: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreateEvidenceSessionRequest,
    }): CancelablePromise<CreateEvidenceSessionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/evidence-sessions',
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
     * Retrieve an organization evidence session
     * Returns only an evidence session owned by the authenticated merchant organization. An evidence-session identifier or redemption link does not grant this read authority.
     * @returns EvidenceSessionResponse The organization-authorized evidence session projection.
     * @throws ApiError
     */
    public getEvidenceSession({
        evidenceSessionId,
    }: {
        evidenceSessionId: string,
    }): CancelablePromise<EvidenceSessionResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/evidence-sessions/{evidenceSessionId}',
            path: {
                'evidenceSessionId': evidenceSessionId,
            },
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                404: `The resource was not found in the authenticated organization.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Redeem an actor-bound evidence session
     * Validates Firebase user identity, App Check, actor binding, expiry, cancellation, redemption limit, and the one-time token before issuing a legacy native capture-session nonce. Exact operation-key retries replay the same capture authorization; unrelated replays are rejected.
     * @returns RedeemEvidenceSessionResponse An exact operation-key retry returned the original native capture-session nonce.
     * @throws ApiError
     */
    public redeemEvidenceSession({
        evidenceSessionId,
        requestBody,
    }: {
        evidenceSessionId: string,
        requestBody: RedeemEvidenceSessionRequest,
    }): CancelablePromise<RedeemEvidenceSessionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/evidence-sessions/{evidenceSessionId}/redeem',
            path: {
                'evidenceSessionId': evidenceSessionId,
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
     * Cancel an organization evidence session
     * Revokes an unfinalized evidence session for the authenticated merchant organization and removes any remaining redemption capability. Cancellation does not erase already captured records.
     * @returns EvidenceSessionResponse The evidence session is cancelled, or an exact cancellation retry returned the cancelled session.
     * @throws ApiError
     */
    public cancelEvidenceSession({
        evidenceSessionId,
        requestBody,
    }: {
        evidenceSessionId: string,
        requestBody: CancelEvidenceSessionRequest,
    }): CancelablePromise<EvidenceSessionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/evidence-sessions/{evidenceSessionId}/cancel',
            path: {
                'evidenceSessionId': evidenceSessionId,
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
}
