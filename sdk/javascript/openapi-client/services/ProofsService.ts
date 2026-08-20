/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePassportExportRequest } from '../models/CreatePassportExportRequest';
import type { CreatePassportSnapshotRequest } from '../models/CreatePassportSnapshotRequest';
import type { PassportExportResponse } from '../models/PassportExportResponse';
import type { PassportResponse } from '../models/PassportResponse';
import type { PassportSnapshotResponse } from '../models/PassportSnapshotResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ProofsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Canonical JSON Proof
     * Alias of GET /v1/portal/transactions/{transactionId}/passport. Returns the live Proof projection.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getPortalProof({
        transactionId,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
    }): CancelablePromise<PassportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/portal/transactions/{transactionId}/proof',
            path: {
                'transactionId': transactionId,
            },
            errors: {
                401: `Missing or invalid authentication.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Retrieve the live Proof
     * Preferred alias of GET /v1/transactions/{transactionId}/passport. Returns the canonical Proof aggregation.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getProof({
        transactionId,
        framework,
        category,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        /**
         * Optional receiving-party workflow identifier used only to fill reviewContext. Not stored on Passport identity.
         */
        framework?: string,
        /**
         * Optional dispute category used only with framework to fill reviewContext.
         */
        category?: string,
    }): CancelablePromise<PassportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/transactions/{transactionId}/proof',
            path: {
                'transactionId': transactionId,
            },
            query: {
                'framework': framework,
                'category': category,
            },
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Freeze a Proof snapshot
     * Preferred alias of POST /v1/transactions/{transactionId}/passport/snapshots.
     * @returns PassportSnapshotResponse The original Passport snapshot for an exact idempotent retry.
     * @throws ApiError
     */
    public createProofSnapshot({
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
        requestBody: CreatePassportSnapshotRequest,
    }): CancelablePromise<PassportSnapshotResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/proof/snapshots',
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
     * Retrieve a live Proof by id
     * Preferred alias of GET /v1/passports/{passportId}. Accepts a ppt_ resource id or a PP-XXXX-XXXX-XXXX display id.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getProofById({
        proofId,
        framework,
        category,
    }: {
        /**
         * A Proof resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Possession of the identifier does not grant access.
         */
        proofId: string,
        /**
         * Optional receiving-party workflow identifier used only to fill reviewContext. Not stored on Passport identity.
         */
        framework?: string,
        /**
         * Optional dispute category used only with framework to fill reviewContext.
         */
        category?: string,
    }): CancelablePromise<PassportResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/proofs/{proofId}',
            path: {
                'proofId': proofId,
            },
            query: {
                'framework': framework,
                'category': category,
            },
            errors: {
                400: `Invalid request.`,
                401: `Missing or invalid authentication.`,
                403: `Authenticated but not authorized.`,
                404: `The resource was not found in the authenticated organization.`,
                409: `The request conflicts with idempotency or resource state.`,
                429: `The operation rate limit was exceeded.`,
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Retrieve an immutable Proof snapshot
     * Preferred alias of GET /v1/passports/{passportId}/snapshots/{snapshotId}.
     * @returns PassportSnapshotResponse The immutable Passport snapshot.
     * @throws ApiError
     */
    public getProofSnapshot({
        proofId,
        snapshotId,
    }: {
        /**
         * A Proof resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Possession of the identifier does not grant access.
         */
        proofId: string,
        snapshotId: string,
    }): CancelablePromise<PassportSnapshotResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/proofs/{proofId}/snapshots/{snapshotId}',
            path: {
                'proofId': proofId,
                'snapshotId': snapshotId,
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
     * Create a presentation-only Proof PDF export
     * Preferred alias of POST /v1/passports/{passportId}/snapshots/{snapshotId}/exports.
     * @returns PassportExportResponse The original Passport PDF export for an exact idempotent retry.
     * @throws ApiError
     */
    public createProofExport({
        proofId,
        snapshotId,
        idempotencyKey,
        requestBody,
    }: {
        /**
         * A Proof resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Possession of the identifier does not grant access.
         */
        proofId: string,
        snapshotId: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreatePassportExportRequest,
    }): CancelablePromise<PassportExportResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/proofs/{proofId}/snapshots/{snapshotId}/exports',
            path: {
                'proofId': proofId,
                'snapshotId': snapshotId,
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
