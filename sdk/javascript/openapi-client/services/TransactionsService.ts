/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateTransactionRequest } from '../models/CreateTransactionRequest';
import type { CreateTransactionResponse } from '../models/CreateTransactionResponse';
import type { GetTransactionResponse } from '../models/GetTransactionResponse';
import type { ListTransactionsResponse } from '../models/ListTransactionsResponse';
import type { TimelineResponse } from '../models/TimelineResponse';
import type { TransactionStatus } from '../models/TransactionStatus';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class TransactionsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay a merchant transaction
     * Creates one immutable PackProof transaction identifier. An exact Idempotency-Key replay returns the original result; a key reused with different input is rejected.
     * @returns CreateTransactionResponse The original result for an exact idempotent replay.
     * @throws ApiError
     */
    public createTransaction({
        idempotencyKey,
        requestBody,
    }: {
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreateTransactionRequest,
    }): CancelablePromise<CreateTransactionResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions',
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
     * List organization transactions
     * Returns only transactions owned by the authenticated credential's organization, ordered by server creation time and PackProof transaction ID.
     * @returns ListTransactionsResponse An organization-isolated transaction page.
     * @throws ApiError
     */
    public listTransactions({
        status,
        merchantReference,
        createdAfter,
        createdBefore,
        cursor,
        limit = 25,
    }: {
        status?: TransactionStatus,
        merchantReference?: string,
        createdAfter?: string,
        createdBefore?: string,
        cursor?: string,
        limit?: number,
    }): CancelablePromise<ListTransactionsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions',
            query: {
                'status': status,
                'merchantReference': merchantReference,
                'createdAfter': createdAfter,
                'createdBefore': createdBefore,
                'cursor': cursor,
                'limit': limit,
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
     * Retrieve one organization transaction
     * @returns GetTransactionResponse The authorized merchant transaction.
     * @throws ApiError
     */
    public getTransaction({
        transactionId,
    }: {
        transactionId: string,
    }): CancelablePromise<GetTransactionResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}',
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
     * Retrieve the public audit timeline
     * Returns participant-visible timeline summaries. Internal actor identifiers are excluded.
     * @returns TimelineResponse The public audit timeline.
     * @throws ApiError
     */
    public getTimeline({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<TimelineResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/timeline',
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
}
