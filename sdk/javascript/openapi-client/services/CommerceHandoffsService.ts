/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePublicCommerceHandoffRequest } from '../models/CreatePublicCommerceHandoffRequest';
import type { PublicCommerceHandoffResponse } from '../models/PublicCommerceHandoffResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class CommerceHandoffsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay a page-declared passport-draft handoff
     * Browser-safe endpoint for the PackProof Button. The publishable installation key identifies an integration but is not a secret or merchant authorization. PackProof requires an exact allowlisted HTTPS Origin, binds idempotency to the integration, origin, and canonical request, and caps the result at PAGE_DECLARED trust. This endpoint cannot assert payment, create or bind an external order, or finalize evidence.
     * @returns PublicCommerceHandoffResponse The original short-lived result for an exact browser idempotency replay.
     * @throws ApiError
     */
    public createPublicCommerceHandoff({
        publishableKey,
        origin,
        idempotencyKey,
        requestBody,
    }: {
        /**
         * Public PackProof Button installation identifier. It is safe to place in browser code and grants no merchant or order authority.
         */
        publishableKey: string,
        /**
         * Browser-supplied exact HTTPS origin. Origin allowlisting constrains browser embedding but is not treated as cryptographic merchant authentication.
         */
        origin: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreatePublicCommerceHandoffRequest,
    }): CancelablePromise<PublicCommerceHandoffResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/public/integrations/{publishableKey}/handoffs',
            path: {
                'publishableKey': publishableKey,
            },
            headers: {
                'Origin': origin,
                'Idempotency-Key': idempotencyKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request.`,
                403: `Authenticated but not authorized.`,
                409: `The request conflicts with idempotency or resource state.`,
                413: `The request body exceeded 256 KiB.`,
                415: `The request Content-Type is unsupported.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
}
