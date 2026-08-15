/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EvidenceListResponse } from '../models/EvidenceListResponse';
import type { EvidenceResponse } from '../models/EvidenceResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class EvidenceService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * List transaction evidence artifacts
     * Returns the organization-authorized inventory of captured evidence metadata, hashes, and layered assurance. Storage paths, uploader identities, and forensic-only fields are excluded. This is not item authentication or a dispute outcome.
     * @returns EvidenceListResponse The organization-authorized evidence inventory.
     * @throws ApiError
     */
    public listEvidence({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<EvidenceListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/evidence',
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
     * Retrieve one evidence artifact
     * @returns EvidenceResponse The organization-authorized evidence artifact.
     * @throws ApiError
     */
    public getEvidence({
        transactionId,
        artifactId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        artifactId: string,
    }): CancelablePromise<EvidenceResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/evidence/{artifactId}',
            path: {
                'transactionId': transactionId,
                'artifactId': artifactId,
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
