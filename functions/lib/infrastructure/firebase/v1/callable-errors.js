"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throwCallableError = throwCallableError;
const https_1 = require("firebase-functions/v2/https");
const errors_1 = require("../../../application/v1/errors");
function throwCallableError(error) {
    if (!(error instanceof errors_1.ApplicationError))
        throw error;
    const codeByCategory = {
        INVALID_ARGUMENT: 'invalid-argument',
        UNAUTHENTICATED: 'unauthenticated',
        FORBIDDEN: 'permission-denied',
        NOT_FOUND: 'not-found',
        CONFLICT: 'already-exists',
        DEADLINE_EXCEEDED: 'deadline-exceeded',
        FAILED_PRECONDITION: 'failed-precondition',
        RESOURCE_EXHAUSTED: 'resource-exhausted',
        RETRYABLE_CONFLICT: 'aborted',
    };
    throw new https_1.HttpsError(codeByCategory[error.category], error.message, {
        applicationCode: error.code,
        details: error.details,
        retryAfterSeconds: error.retryAfterSeconds ?? null,
    });
}
//# sourceMappingURL=callable-errors.js.map