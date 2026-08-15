/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ReviewPackageResponse } from '../models/ReviewPackageResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ClaimsReviewService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Retrieve a claims-review evidence package
     * Organizes terms, protocol completeness, hashed evidence, shipment/return records, and timeline for authorized human review. Documentation categories are filing labels only. The package never states fraud, fault, authenticity, custody, or a card-network, carrier, marketplace, or payment disposition.
     * @returns ReviewPackageResponse The claims-review evidence package. It organizes documentation; it does not decide a claim.
     * @throws ApiError
     */
    public getReviewPackage({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<ReviewPackageResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/review-package',
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
