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
export class PassportsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Retrieve the live PackProof Passport
     * Returns the canonical PackProof Passport aggregation for a transaction and binds a stable Passport identity the first time eligibility passes. The Passport inventories source-attributed records and integrity bindings. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome. Absence of evidence does not make a Passport inauthentic. Returns 409 PASSPORT_NOT_READY when eligibility fails.
     * @returns PassportResponse The live PackProof Passport aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getPassport({
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
            url: '/v1/transactions/{transactionId}/passport',
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
     * Freeze a PackProof Passport snapshot
     * Stores an immutable canonical JSON snapshot of the live Passport for later PDF export. Native evidence remains the source.
     * @returns PassportSnapshotResponse The original Passport snapshot for an exact idempotent retry.
     * @throws ApiError
     */
    public createPassportSnapshot({
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
            url: '/v1/transactions/{transactionId}/passport/snapshots',
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
     * Retrieve a live PackProof Passport by Passport id
     * Accepts a ppt_ resource id or a PP-XXXX-XXXX-XXXX display id. Authorization is still required. The QR or verification URL does not grant access.
     * @returns PassportResponse The live PackProof Passport aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getPassportById({
        passportId,
        framework,
        category,
    }: {
        /**
         * A PackProof Passport resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Possession of the identifier does not grant access.
         */
        passportId: string,
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
            url: '/v1/passports/{passportId}',
            path: {
                'passportId': passportId,
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
     * Retrieve an immutable Passport snapshot
     * @returns PassportSnapshotResponse The immutable Passport snapshot.
     * @throws ApiError
     */
    public getPassportSnapshot({
        passportId,
        snapshotId,
    }: {
        /**
         * A PackProof Passport resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Possession of the identifier does not grant access.
         */
        passportId: string,
        snapshotId: string,
    }): CancelablePromise<PassportSnapshotResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/passports/{passportId}/snapshots/{snapshotId}',
            path: {
                'passportId': passportId,
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
     * Create a presentation-only Passport PDF export
     * Renders a frozen snapshot to PDF. presentationOnly remains true. Native artifacts and manifests remain the source records. HMAC-SHA256 service authentication is not a digital signature.
     * @returns PassportExportResponse The original Passport PDF export for an exact idempotent retry.
     * @throws ApiError
     */
    public createPassportExport({
        passportId,
        snapshotId,
        idempotencyKey,
        requestBody,
    }: {
        /**
         * A PackProof Passport resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Possession of the identifier does not grant access.
         */
        passportId: string,
        snapshotId: string,
        /**
         * A unique key for this logical mutation. Reuse only for an exact retry.
         */
        idempotencyKey: string,
        requestBody: CreatePassportExportRequest,
    }): CancelablePromise<PassportExportResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/passports/{passportId}/snapshots/{snapshotId}/exports',
            path: {
                'passportId': passportId,
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
