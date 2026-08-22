/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreatePassportExportRequest } from '../models/CreatePassportExportRequest';
import type { CreatePassportSnapshotRequest } from '../models/CreatePassportSnapshotRequest';
import type { IssueProofIdentityRequest } from '../models/IssueProofIdentityRequest';
import type { PassportExportResponse } from '../models/PassportExportResponse';
import type { PassportResponse } from '../models/PassportResponse';
import type { PassportSnapshotResponse } from '../models/PassportSnapshotResponse';
import type { ProofIdentityResponse } from '../models/ProofIdentityResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PassportsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Retrieve the live Proof
     * Returns the canonical Proof aggregation for a transaction. GET is read-only and never binds identity. Eligible transactions without a bound identity return 409 PROOF_IDENTITY_NOT_BOUND until POST /proof/identity or server finalization issues one. Proof is the product name for the Passport projection. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome. Absence of evidence does not make a Proof inauthentic. Returns 409 PASSPORT_NOT_READY when eligibility fails.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
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
     * Issue or replay the Proof identity
     * Atomically binds one ppt_ resource identity and one PP- display identity. Idempotent under concurrent Android, Portal, and API first access. GET Proof remains read-only.
     * @returns ProofIdentityResponse The bound Proof identity. One ppt_ resource and one PP- display identity exist for the transaction.
     * @throws ApiError
     */
    public issuePassportIdentity({
        transactionId,
        requestBody,
    }: {
        /**
         * A merchant transaction identifier or an accepted Connect-origin transaction identifier. Possession of the identifier does not grant access.
         */
        transactionId: string,
        requestBody: IssueProofIdentityRequest,
    }): CancelablePromise<ProofIdentityResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/v1/transactions/{transactionId}/passport/identity',
            path: {
                'transactionId': transactionId,
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
     * Freeze a Proof snapshot
     * Stores an immutable canonical JSON snapshot of the live Proof for later PDF export. Native evidence remains the source. Passport is the deprecated product name for this object.
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
     * Retrieve a live Proof by id
     * Accepts a ppt_ resource id or a PP-XXXX-XXXX-XXXX display id. Authorization is still required. The QR or verification URL does not grant access. GET /v1/proofs/{proofId} is the preferred path alias.
     * @returns PassportResponse The live Proof aggregation. It does not authenticate items, prove custody, decide fraud or fault, or guarantee a dispute outcome.
     * @throws ApiError
     */
    public getPassportById({
        passportId,
        framework,
        category,
    }: {
        /**
         * A Proof resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Passport is the deprecated product name for the same identifier. Possession of the identifier does not grant access.
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
     * Retrieve an immutable Proof snapshot
     * @returns PassportSnapshotResponse The immutable Passport snapshot.
     * @throws ApiError
     */
    public getPassportSnapshot({
        passportId,
        snapshotId,
    }: {
        /**
         * A Proof resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Passport is the deprecated product name for the same identifier. Possession of the identifier does not grant access.
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
     * Create a presentation-only Proof PDF export
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
         * A Proof resource id (ppt_) or display id (PP-XXXX-XXXX-XXXX). Passport is the deprecated product name for the same identifier. Possession of the identifier does not grant access.
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
