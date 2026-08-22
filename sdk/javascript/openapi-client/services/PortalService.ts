/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePortalMobileHandoffRequest } from '../models/CreatePortalMobileHandoffRequest';
import type { EvidenceListResponse } from '../models/EvidenceListResponse';
import type { PassportResponse } from '../models/PassportResponse';
import type { PortalHomeResponse } from '../models/PortalHomeResponse';
import type { PortalMobileHandoffResponse } from '../models/PortalMobileHandoffResponse';
import type { PortalSessionResponse } from '../models/PortalSessionResponse';
import type { PortalTransactionListResponse } from '../models/PortalTransactionListResponse';
import type { PortalTransactionResponse } from '../models/PortalTransactionResponse';
import type { TimelineResponse } from '../models/TimelineResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PortalService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Current portal actor
     * Returns the authenticated PackProof actor for the web portal. A Firebase ID token and App Check token are required. Merchant API keys are rejected.
     * @returns PortalSessionResponse The portal session.
     * @throws ApiError
     */
    public getPortalSession(): CancelablePromise<PortalSessionResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/session',
            errors: {
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Portal home queue
     * Lists PackProofs the authenticated actor participates in. The client applies the shared Next Action Engine; this endpoint does not invent browser-specific lifecycle states.
     * @returns PortalHomeResponse Home workspace.
     * @throws ApiError
     */
    public getPortalHome(): CancelablePromise<PortalHomeResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/home',
            errors: {
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * List the actor's PackProofs
     * @returns PortalTransactionListResponse Participant-authorized transactions.
     * @throws ApiError
     */
    public listPortalTransactions(): CancelablePromise<PortalTransactionListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions',
            errors: {
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Get a participant-authorized PackProof
     * @returns PortalTransactionResponse Transaction workspace record.
     * @throws ApiError
     */
    public getPortalTransaction({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<PortalTransactionResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions/{transactionId}',
            path: {
                'transactionId': transactionId,
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
     * Transaction timeline
     * @returns TimelineResponse The public audit timeline.
     * @throws ApiError
     */
    public getPortalTimeline({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<TimelineResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions/{transactionId}/timeline',
            path: {
                'transactionId': transactionId,
            },
            errors: {
                401: `Missing or invalid authentication.`,
                404: `The resource was not found in the authenticated organization.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Evidence metadata
     * Returns evidence inventory metadata. Storage object paths are never included. Browser capture is not this resource.
     * @returns EvidenceListResponse The organization-authorized evidence inventory.
     * @throws ApiError
     */
    public listPortalEvidence({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<EvidenceListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions/{transactionId}/evidence',
            path: {
                'transactionId': transactionId,
            },
            errors: {
                401: `Missing or invalid authentication.`,
                404: `The resource was not found in the authenticated organization.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Canonical JSON Proof
     * Returns PackProofPassportV1, the live Proof projection. Passport is the deprecated product name for the same object. The portal renders this JSON; it does not assemble a Proof in the browser.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getPortalPassport({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<PassportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions/{transactionId}/passport',
            path: {
                'transactionId': transactionId,
            },
            errors: {
                401: `Missing or invalid authentication.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Canonical JSON Proof
     * Alias of GET /v1/portal/transactions/{transactionId}/passport. Returns the live Proof projection.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getPortalProof({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<PassportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions/{transactionId}/proof',
            path: {
                'transactionId': transactionId,
            },
            errors: {
                401: `Missing or invalid authentication.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Issue a native capture handoff
     * Returns a short-lived native handoff object. The URL opens the transaction; native re-evaluates the current Next Action and must not execute a stale mint-time capture hint. Browser uploads are not native capture and are not accepted.
     * @returns PortalMobileHandoffResponse Native capture handoff.
     * @throws ApiError
     */
    public createPortalMobileHandoff({
        transactionId,
        requestBody,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        requestBody: CreatePortalMobileHandoffRequest,
    }): CancelablePromise<PortalMobileHandoffResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/portal/transactions/{transactionId}/mobile-handoff',
            path: {
                'transactionId': transactionId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                404: `The resource was not found in the authenticated organization.`,
                415: `The request Content-Type is unsupported.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
}
