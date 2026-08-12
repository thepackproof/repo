"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplicationError = exports.applicationErrorCategories = void 0;
exports.applicationErrorCategories = [
    'INVALID_ARGUMENT',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'DEADLINE_EXCEEDED',
    'FAILED_PRECONDITION',
    'RESOURCE_EXHAUSTED',
    'RETRYABLE_CONFLICT',
];
class ApplicationError extends Error {
    category;
    code;
    details;
    retryAfterSeconds;
    constructor(category, code, message, details = [], retryAfterSeconds) {
        super(message);
        this.category = category;
        this.code = code;
        this.details = details;
        this.retryAfterSeconds = retryAfterSeconds;
        this.name = 'ApplicationError';
    }
}
exports.ApplicationError = ApplicationError;
//# sourceMappingURL=errors.js.map