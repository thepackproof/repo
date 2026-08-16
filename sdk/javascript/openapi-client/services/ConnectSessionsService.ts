/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelConnectSessionRequest } from '../models/CancelConnectSessionRequest';
import type { ConnectSessionListResponse } from '../models/ConnectSessionListResponse';
import type { ConnectSessionResponse } from '../models/ConnectSessionResponse';
import type { CreateConnectSessionRequest } from '../models/CreateConnectSessionRequest';
import type { CreateConnectSessionResponse } from '../models/CreateConnectSessionResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ConnectSessionsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay an order-bound Connect session
     * Creates a seven-day order-bound capture session for an API client bound to an active PackProof Connect integration. This is merchant-server attested order binding, not the page-declared Button path. The capture URL and token are returned only here and on exact idempotent replay. Send the capture URL to the seller; do not log the token. After the seller redeems the handoff and packing evidence is server-finalized, PackProof posts packproof.evidence.finalized to callbackUrl.
     * @returns CreateConnectSessionResponse The original Connect session for an exact idempotent retry.
     * @throws ApiError
     */
    public createConnectSession({
        idempotencyKey,
        requestBody,
    }: {
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreateConnectSessionRequest,
    }): CancelablePromise<CreateConnectSessionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/connect/sessions',
            headers: {
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                409: `The request conflicts with idempotency or resource state.`,
                413: `The request body exceeded 256 KiB.`,
                415: `The request Content-Type is unsupported.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * List Connect sessions for an external order
     * Returns Connect sessions for the authenticated integration or organization that match the partner's externalOrderId. Use this when the original session identifier was not retained. The handoff token is never returned.
     * @returns ConnectSessionListResponse Connect sessions matching the partner external order identifier.
     * @throws ApiError
     */
    public listConnectSessions({
        externalOrderId,
    }: {
        /**
         * The partner's order identifier supplied when the Connect session was created.
         */
        externalOrderId: string,
    }): CancelablePromise<ConnectSessionListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/connect/sessions',
            query: {
                'externalOrderId': externalOrderId,
            },
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Retrieve a Connect session
     * Returns session status and the bound transaction identifier after seller redemption. PENDING_REDEMPTION sessions past expiresAt are returned as EXPIRED. The handoff token is never returned on GET.
     * @returns ConnectSessionResponse The organization-authorized Connect session.
     * @throws ApiError
     */
    public getConnectSession({
        sessionId,
    }: {
        sessionId: string,
    }): CancelablePromise<ConnectSessionResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/connect/sessions/{sessionId}',
            path: {
                'sessionId': sessionId,
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
     * Cancel an unredeemed Connect session
     * Revokes the one-time capture handoff for a session that is still PENDING_REDEMPTION or EXPIRED. Redeemed sessions cannot be cancelled. Exact actor replay after a successful cancel returns the cancelled session.
     * @returns ConnectSessionResponse The unredeemed Connect session was cancelled, or the original cancelled session was returned.
     * @throws ApiError
     */
    public cancelConnectSession({
        sessionId,
        requestBody,
    }: {
        sessionId: string,
        requestBody: CancelConnectSessionRequest,
    }): CancelablePromise<ConnectSessionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/connect/sessions/{sessionId}/cancel',
            path: {
                'sessionId': sessionId,
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
