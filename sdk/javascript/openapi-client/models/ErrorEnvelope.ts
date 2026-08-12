/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ErrorDetail } from './ErrorDetail';
export type ErrorEnvelope = {
    error: {
        code: string;
        message: string;
        requestId: string;
        details: Array<ErrorDetail>;
    };
};

