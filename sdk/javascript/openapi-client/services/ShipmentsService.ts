/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AssociateShipmentRequest } from '../models/AssociateShipmentRequest';
import type { ShipmentResponse } from '../models/ShipmentResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ShipmentsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Retrieve the associated shipment
     * Returns merchant-asserted carrier and tracking context. This is not carrier custody proof.
     * @returns ShipmentResponse The associated merchant-asserted shipment.
     * @throws ApiError
     */
    public getShipment({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<ShipmentResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/shipment',
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
     * Associate tracking after packing and seal evidence
     * Records merchant-asserted carrier tracking only after a server-finalized packing video and high-resolution seal reference are present with no recorded byte-integrity mismatch. Tracking association is not a custody, delivery, or fraud determination.
     * @returns ShipmentResponse The original shipment association for an exact idempotent retry.
     * @throws ApiError
     */
    public associateShipment({
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
        requestBody: AssociateShipmentRequest,
    }): CancelablePromise<ShipmentResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/shipment',
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
