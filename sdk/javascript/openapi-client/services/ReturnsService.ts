/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssociateShipmentRequest } from '../models/AssociateShipmentRequest';
import type { CreateReturnRequest } from '../models/CreateReturnRequest';
import type { ReturnListResponse } from '../models/ReturnListResponse';
import type { ReturnResponse } from '../models/ReturnResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ReturnsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * List return passports
     * @returns ReturnListResponse Return passports for the authorized transaction.
     * @throws ApiError
     */
    public listReturns({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<ReturnListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/returns',
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
     * Request a return passport
     * Creates a REQUESTED return passport after both participants are claimed and shipment has been recorded. The other participant still authorizes in the native app. This does not approve a refund or decide fault.
     * @returns ReturnResponse The original return passport for an exact idempotent retry.
     * @throws ApiError
     */
    public createReturnPassport({
        transactionId,
        idempotencyKey,
        requestBody,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreateReturnRequest,
    }): CancelablePromise<ReturnResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/returns',
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
     * Retrieve one return passport
     * @returns ReturnResponse One return passport.
     * @throws ApiError
     */
    public getReturn({
        transactionId,
        returnPassportId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        returnPassportId: string,
    }): CancelablePromise<ReturnResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/returns/{returnPassportId}',
            path: {
                'transactionId': transactionId,
                'returnPassportId': returnPassportId,
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
     * Associate return tracking after packing and seal evidence
     * Records merchant-asserted return carrier tracking only after a server-finalized return packing video and high-resolution return seal reference are present with no recorded byte-integrity mismatch. Tracking association is not a custody, refund, or fraud determination.
     * @returns ReturnResponse The original return passport for an exact idempotent retry.
     * @throws ApiError
     */
    public associateReturnShipment({
        transactionId,
        returnPassportId,
        idempotencyKey,
        requestBody,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        returnPassportId: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: AssociateShipmentRequest,
    }): CancelablePromise<ReturnResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/returns/{returnPassportId}/shipment',
            path: {
                'transactionId': transactionId,
                'returnPassportId': returnPassportId,
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
}
