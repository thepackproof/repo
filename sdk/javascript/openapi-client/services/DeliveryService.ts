/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssociateDeliveryRequest } from '../models/AssociateDeliveryRequest';
import type { DeliveryResponse } from '../models/DeliveryResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class DeliveryService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Retrieve the associated receiver arrival
     * Returns merchant-asserted inbound delivery context linked to a server-finalized arrival photograph. This is not carrier custody proof, receipt authentication, or a completed buyer review.
     * @returns DeliveryResponse The associated merchant-asserted receiver arrival.
     * @throws ApiError
     */
    public getDelivery({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<DeliveryResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/delivery',
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
     * Associate receiver arrival after delivery evidence
     * Records merchant-asserted inbound delivery context only after a server-finalized arrival photograph is present with no recorded byte-integrity mismatch. Optional tracking is compared to any barcode observed during capture. This does not complete the transaction or decide a dispute.
     * @returns DeliveryResponse The original delivery association for an exact idempotent retry.
     * @throws ApiError
     */
    public associateDelivery({
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
        requestBody: AssociateDeliveryRequest,
    }): CancelablePromise<DeliveryResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/delivery',
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
}
