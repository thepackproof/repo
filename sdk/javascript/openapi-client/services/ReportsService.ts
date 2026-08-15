/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateEvidenceReportRequest } from '../models/CreateEvidenceReportRequest';
import type { EvidenceReportResponse } from '../models/EvidenceReportResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ReportsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Create or replay a presentation dossier
     * Generates a presentation-only PDF dossier from retained originals and manifests. The dossier does not replace native evidence. A short-lived download URL is included and expires after 15 minutes.
     * @returns EvidenceReportResponse The original presentation dossier for an exact idempotent retry.
     * @throws ApiError
     */
    public createEvidenceReport({
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
        requestBody: CreateEvidenceReportRequest,
    }): CancelablePromise<EvidenceReportResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/reports',
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
     * Retrieve a presentation dossier and short-lived URL
     * @returns EvidenceReportResponse The presentation dossier metadata and a freshly signed short-lived URL.
     * @throws ApiError
     */
    public getEvidenceReport({
        transactionId,
        reportId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        reportId: string,
    }): CancelablePromise<EvidenceReportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/reports/{reportId}',
            path: {
                'transactionId': transactionId,
                'reportId': reportId,
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
