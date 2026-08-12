/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { HealthResponse } from '../models/HealthResponse';
import type { ReadinessResponse } from '../models/ReadinessResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class SystemService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Process health
     * @returns HealthResponse The API process is healthy.
     * @throws ApiError
     */
    public getHealth(): CancelablePromise<HealthResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/health',
            errors: {
                500: `An internal failure occurred without exposing implementation details.`,
            },
        });
    }
    /**
     * Dependency readiness
     * @returns ReadinessResponse Required API dependencies are reachable.
     * @throws ApiError
     */
    public getReadiness(): CancelablePromise<ReadinessResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/v1/ready',
            errors: {
                503: `A required dependency is unavailable.`,
            },
        });
    }
}
