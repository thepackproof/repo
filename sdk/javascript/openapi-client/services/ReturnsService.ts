/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
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
}
