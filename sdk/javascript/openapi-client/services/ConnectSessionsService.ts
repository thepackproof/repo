/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ConnectSessionResponse } from '../models/ConnectSessionResponse';
import type { CreateConnectSessionRequest } from '../models/CreateConnectSessionRequest';
import type { CreateConnectSessionResponse } from '../models/CreateConnectSessionResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ConnectSessionsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay an order-bound Connect session
     * Creates a seven-day order-bound capture session for an API client bound to an active PackProof Connect integration. This is merchant-server attested order binding, not the page-declared Button path. The capture URL and token are returned only here and on exact idempotent replay.
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
     * Retrieve a Connect session
     * Returns session status and the bound transaction identifier after seller redemption. The handoff token is never returned on GET.
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
}
