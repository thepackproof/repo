"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputValidationError = exports.ApiError = exports.merchantTransactionStatuses = exports.captureArtifactTypes = exports.apiScopes = exports.toTransactionDto = exports.sha256 = exports.createTransactionId = exports.canonicalize = void 0;
exports.encodeTransactionCursor = encodeTransactionCursor;
exports.decodeTransactionCursor = decodeTransactionCursor;
exports.transactionQueryHash = transactionQueryHash;
const merchant_transaction_service_1 = require("../../application/v1/merchant-transaction-service");
var merchant_transaction_service_2 = require("../../application/v1/merchant-transaction-service");
Object.defineProperty(exports, "canonicalize", { enumerable: true, get: function () { return merchant_transaction_service_2.canonicalize; } });
Object.defineProperty(exports, "createTransactionId", { enumerable: true, get: function () { return merchant_transaction_service_2.createTransactionId; } });
Object.defineProperty(exports, "sha256", { enumerable: true, get: function () { return merchant_transaction_service_2.sha256; } });
Object.defineProperty(exports, "toTransactionDto", { enumerable: true, get: function () { return merchant_transaction_service_2.toMerchantTransactionDto; } });
var merchant_types_1 = require("../../application/v1/merchant-types");
Object.defineProperty(exports, "apiScopes", { enumerable: true, get: function () { return merchant_types_1.apiScopes; } });
Object.defineProperty(exports, "captureArtifactTypes", { enumerable: true, get: function () { return merchant_types_1.captureArtifactTypes; } });
Object.defineProperty(exports, "merchantTransactionStatuses", { enumerable: true, get: function () { return merchant_types_1.merchantTransactionStatuses; } });
class ApiError extends Error {
    status;
    code;
    details;
    headers;
    constructor(status, code, message, details = [], headers = {}) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.headers = headers;
    }
}
exports.ApiError = ApiError;
class InputValidationError extends ApiError {
    constructor(details) {
        super(400, 'INVALID_REQUEST', 'The request did not satisfy the API contract.', details);
        this.name = 'InputValidationError';
    }
}
exports.InputValidationError = InputValidationError;
function encodeTransactionCursor(payload) {
    return Buffer.from(JSON.stringify({ v: 1, ...payload }), 'utf8').toString('base64url');
}
function decodeTransactionCursor(cursor) {
    try {
        const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (value.v !== 1 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
            || typeof value.id !== 'string' || !/^txn_[a-f0-9]{32}$/.test(value.id)
            || typeof value.queryHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.queryHash)) {
            throw new Error('Invalid cursor shape.');
        }
        return value;
    }
    catch {
        throw new InputValidationError([{ field: 'cursor', code: 'INVALID_CURSOR', message: 'The pagination cursor is invalid or expired.' }]);
    }
}
function transactionQueryHash(organizationId, input) {
    return (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({
        organizationId,
        status: input.status ?? null,
        merchantReference: input.merchantReference ?? null,
        createdAfter: input.createdAfter?.toISOString() ?? null,
        createdBefore: input.createdBefore?.toISOString() ?? null,
    }));
}
//# sourceMappingURL=core.js.map