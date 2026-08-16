"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCreateTransaction = parseCreateTransaction;
exports.parseListTransactions = parseListTransactions;
exports.parseTransactionId = parseTransactionId;
exports.parseIdempotencyKey = parseIdempotencyKey;
exports.parsePublishableKey = parsePublishableKey;
exports.parseBrowserOrigin = parseBrowserOrigin;
exports.parseCreatePublicCommerceHandoff = parseCreatePublicCommerceHandoff;
exports.parsePublicHandoffId = parsePublicHandoffId;
exports.parseParticipantClaimId = parseParticipantClaimId;
exports.parseEvidenceSessionId = parseEvidenceSessionId;
exports.parseCreateParticipantInvitation = parseCreateParticipantInvitation;
exports.parseClaimParticipant = parseClaimParticipant;
exports.parseCreateEvidenceSession = parseCreateEvidenceSession;
exports.parseRedeemEvidenceSession = parseRedeemEvidenceSession;
exports.parseAccessibleTransactionId = parseAccessibleTransactionId;
exports.parseEvidenceArtifactId = parseEvidenceArtifactId;
exports.parseEvidenceReportId = parseEvidenceReportId;
exports.parseReturnPassportId = parseReturnPassportId;
exports.parseConnectSessionId = parseConnectSessionId;
exports.parseListConnectSessions = parseListConnectSessions;
exports.parseCancelConnectSession = parseCancelConnectSession;
exports.parseCreateConnectSession = parseCreateConnectSession;
exports.parseAssociateShipment = parseAssociateShipment;
exports.parseCreateEvidenceReport = parseCreateEvidenceReport;
exports.asApiError = asApiError;
const core_1 = require("./core");
const commerce_1 = require("../../domain/v1/commerce");
const evidence_1 = require("../../domain/v1/evidence");
const transactions_1 = require("../../domain/v1/transactions");
function object(value, field) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_TYPE', message: `${field} must be an object.` }]);
    }
    return value;
}
function rejectUnknown(value, allowed, field = 'body') {
    const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unknown.length) {
        throw new core_1.InputValidationError(unknown.map((key) => ({
            field: field === 'body' ? key : `${field}.${key}`,
            code: 'UNKNOWN_FIELD',
            message: 'This field is not permitted by the v1 contract.',
        })));
    }
}
function string(value, field, min, max, required = true) {
    if (value === undefined && !required)
        return undefined;
    if (typeof value !== 'string') {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_TYPE', message: `${field} must be a string.` }]);
    }
    const normalized = value.trim();
    if (normalized.length < min || normalized.length > max) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_LENGTH', message: `${field} must contain ${min}-${max} characters.` }]);
    }
    return normalized;
}
function integer(value, field, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_INTEGER', message: `${field} must be an integer from ${min} through ${max}.` }]);
    }
    return value;
}
function enumValue(value, field, values) {
    if (typeof value !== 'string' || !values.includes(value)) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_ENUM', message: `${field} contains an unsupported value.` }]);
    }
    return value;
}
function parseAmount(value) {
    if (value === undefined)
        return null;
    const input = object(value, 'amount');
    rejectUnknown(input, ['currency', 'minorUnits'], 'amount');
    const currency = string(input.currency, 'amount.currency', 3, 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
        throw new core_1.InputValidationError([{ field: 'amount.currency', code: 'INVALID_CURRENCY', message: 'Currency must be a three-letter ISO 4217-style code.' }]);
    }
    return { currency, minorUnits: integer(input.minorUnits, 'amount.minorUnits', 0, 10_000_000_000) };
}
function parseParticipants(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > 3) {
        throw new core_1.InputValidationError([{ field: 'participants', code: 'INVALID_ARRAY', message: 'participants must contain at most three entries.' }]);
    }
    const seen = new Set();
    return value.map((entry, index) => {
        const input = object(entry, `participants[${index}]`);
        rejectUnknown(input, ['role', 'externalReference'], `participants[${index}]`);
        const role = enumValue(input.role, `participants[${index}].role`, ['SELLER', 'BUYER', 'RECEIVER']);
        if (seen.has(role)) {
            throw new core_1.InputValidationError([{ field: `participants[${index}].role`, code: 'DUPLICATE_ROLE', message: 'Each participant role may appear only once.' }]);
        }
        seen.add(role);
        return { role, externalReference: string(input.externalReference, `participants[${index}].externalReference`, 1, 200) };
    });
}
function parseCaptureRequirements(value) {
    if (value === undefined)
        return { requiredArtifactTypes: [] };
    const input = object(value, 'captureRequirements');
    rejectUnknown(input, ['requiredArtifactTypes'], 'captureRequirements');
    if (!Array.isArray(input.requiredArtifactTypes) || input.requiredArtifactTypes.length > core_1.captureArtifactTypes.length) {
        throw new core_1.InputValidationError([{ field: 'captureRequirements.requiredArtifactTypes', code: 'INVALID_ARRAY', message: 'requiredArtifactTypes must be an array of supported evidence types.' }]);
    }
    const values = input.requiredArtifactTypes.map((entry, index) => enumValue(entry, `captureRequirements.requiredArtifactTypes[${index}]`, core_1.captureArtifactTypes));
    if (new Set(values).size !== values.length) {
        throw new core_1.InputValidationError([{ field: 'captureRequirements.requiredArtifactTypes', code: 'DUPLICATE_VALUE', message: 'Artifact requirements may not contain duplicates.' }]);
    }
    return { requiredArtifactTypes: values };
}
function parseCreateTransaction(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['merchantReference', 'title', 'description', 'category', 'amount', 'participants', 'captureRequirements']);
    return {
        merchantReference: string(input.merchantReference, 'merchantReference', 1, 200),
        title: string(input.title, 'title', 1, 300),
        description: string(input.description, 'description', 0, 3_000, false) ?? '',
        category: string(input.category, 'category', 1, 120, false) ?? null,
        amount: parseAmount(input.amount),
        participants: parseParticipants(input.participants),
        captureRequirements: parseCaptureRequirements(input.captureRequirements),
    };
}
function oneQueryValue(value, field) {
    if (value === undefined)
        return undefined;
    if (Array.isArray(value) || typeof value !== 'string') {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_QUERY', message: `${field} must be supplied exactly once.` }]);
    }
    return value;
}
function queryDate(value, field) {
    const raw = oneQueryValue(value, field);
    if (raw === undefined)
        return undefined;
    const date = new Date(raw);
    const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (!rfc3339.test(raw) || !Number.isFinite(date.getTime())) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_TIMESTAMP', message: `${field} must be an RFC 3339 UTC timestamp.` }]);
    }
    return date;
}
function parseListTransactions(query) {
    rejectUnknown(query, ['status', 'merchantReference', 'createdAfter', 'createdBefore', 'cursor', 'limit'], 'query');
    const statusRaw = oneQueryValue(query.status, 'status');
    const merchantReferenceRaw = oneQueryValue(query.merchantReference, 'merchantReference');
    const cursorRaw = oneQueryValue(query.cursor, 'cursor');
    const limitRaw = oneQueryValue(query.limit, 'limit');
    let limit = 25;
    if (limitRaw !== undefined) {
        if (!/^\d+$/.test(limitRaw)) {
            throw new core_1.InputValidationError([{ field: 'limit', code: 'INVALID_INTEGER', message: 'limit must be an integer from 1 through 100.' }]);
        }
        limit = integer(Number(limitRaw), 'limit', 1, 100);
    }
    const createdAfter = queryDate(query.createdAfter, 'createdAfter');
    const createdBefore = queryDate(query.createdBefore, 'createdBefore');
    if (createdAfter && createdBefore && createdAfter >= createdBefore) {
        throw new core_1.InputValidationError([{ field: 'createdAfter', code: 'INVALID_RANGE', message: 'createdAfter must be earlier than createdBefore.' }]);
    }
    return {
        ...(statusRaw ? { status: enumValue(statusRaw, 'status', core_1.merchantTransactionStatuses) } : {}),
        ...(merchantReferenceRaw ? { merchantReference: string(merchantReferenceRaw, 'merchantReference', 1, 200) } : {}),
        ...(createdAfter ? { createdAfter } : {}),
        ...(createdBefore ? { createdBefore } : {}),
        ...(cursorRaw ? { cursor: string(cursorRaw, 'cursor', 8, 2_000) } : {}),
        limit,
    };
}
function parseTransactionId(value) {
    if (typeof value !== 'string' || !/^txn_[a-f0-9]{32}$/.test(value)) {
        const details = [{ field: 'transactionId', code: 'INVALID_ID', message: 'transactionId is not a valid PackProof transaction identifier.' }];
        throw new core_1.InputValidationError(details);
    }
    return value;
}
function parseIdempotencyKey(value) {
    if (typeof value !== 'string' || value.length < 8 || value.length > 200 || !/^[\x21-\x7e]+$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'Idempotency-Key', code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 8-200 visible ASCII characters.' }]);
    }
    return value;
}
function nullableString(value, field, min, max) {
    if (value === null || value === undefined)
        return null;
    return string(value, field, min, max);
}
function parsePublishableKey(value) {
    if (typeof value !== 'string' || !/^pp_pub_(?:sandbox|live)_[A-Za-z0-9_-]{20,80}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'publishableKey', code: 'INVALID_PUBLISHABLE_KEY', message: 'publishableKey is not a valid PackProof Button installation key.' }]);
    }
    return value;
}
function parseBrowserOrigin(value) {
    if (typeof value !== 'string' || value.length > 500) {
        throw new core_1.InputValidationError([{ field: 'Origin', code: 'ORIGIN_REQUIRED', message: 'A browser Origin header is required.' }]);
    }
    return value;
}
function parseCreatePublicCommerceHandoff(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion', 'source', 'item']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    const source = object(input.source, 'source');
    rejectUnknown(source, ['platform', 'productUrl', 'externalProductId', 'externalListingId', 'externalVariantId'], 'source');
    const productUrl = string(source.productUrl, 'source.productUrl', 1, 2_000);
    let parsedProductUrl;
    try {
        parsedProductUrl = new URL(productUrl);
    }
    catch {
        throw new core_1.InputValidationError([{ field: 'source.productUrl', code: 'INVALID_URL', message: 'source.productUrl must be a valid URL.' }]);
    }
    if (parsedProductUrl.protocol !== 'https:' || parsedProductUrl.username || parsedProductUrl.password) {
        throw new core_1.InputValidationError([{ field: 'source.productUrl', code: 'INVALID_URL', message: 'source.productUrl must use HTTPS without embedded credentials.' }]);
    }
    try {
        return {
            schemaVersion: 1,
            source: {
                platform: enumValue(source.platform ?? 'STRUCTURED_PAGE_DATA', 'source.platform', commerce_1.commercePlatforms),
                productUrl,
                externalProductId: nullableString(source.externalProductId, 'source.externalProductId', 1, 200),
                externalListingId: nullableString(source.externalListingId, 'source.externalListingId', 1, 200),
                externalVariantId: nullableString(source.externalVariantId, 'source.externalVariantId', 1, 200),
            },
            item: (0, commerce_1.parseItemDescriptor)(input.item, 'item'),
        };
    }
    catch (error) {
        if (error instanceof core_1.InputValidationError)
            throw error;
        const issue = error && typeof error === 'object' && 'issues' in error
            ? error.issues?.[0]
            : null;
        throw new core_1.InputValidationError([{
                field: issue?.path ?? 'item',
                code: issue?.code ?? 'INVALID_ITEM',
                message: issue?.message ?? 'item does not satisfy the v1 commerce descriptor contract.',
            }]);
    }
}
function parsePublicHandoffId(value) {
    if (typeof value !== 'string' || !/^hnd_[a-f0-9]{40}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'handoffId', code: 'INVALID_ID', message: 'handoffId is not a valid public commerce handoff identifier.' }]);
    }
    return value;
}
function parseParticipantClaimId(value) {
    if (typeof value !== 'string' || !/^claim_[a-f0-9]{40}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'claimId', code: 'INVALID_ID', message: 'claimId is not a valid PackProof participant-claim identifier.' }]);
    }
    return value;
}
function parseEvidenceSessionId(value) {
    if (typeof value !== 'string' || !/^es_[a-f0-9]{40}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'evidenceSessionId', code: 'INVALID_ID', message: 'evidenceSessionId is not a valid PackProof evidence-session identifier.' }]);
    }
    return value;
}
function optionalInteger(value, field, min, max, defaultValue) {
    if (value === undefined)
        return defaultValue;
    return integer(value, field, min, max);
}
function optionalNullableString(value, field, min, max, pattern) {
    if (value === undefined || value === null)
        return null;
    const result = string(value, field, min, max);
    if (pattern && !pattern.test(result)) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_FORMAT', message: `${field} has an invalid format.` }]);
    }
    return result;
}
function parseCreateParticipantInvitation(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion', 'role', 'externalReference', 'expiresInSeconds']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    return {
        role: enumValue(input.role, 'role', transactions_1.participantRoles),
        externalReference: string(input.externalReference, 'externalReference', 1, 300),
        expiresInSeconds: optionalInteger(input.expiresInSeconds, 'expiresInSeconds', 300, 7 * 86400, 86400),
    };
}
function parseClaimParticipant(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion', 'claimId', 'token']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    const token = string(input.token, 'token', 40, 200);
    if (!/^pp_claim_v1_[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new core_1.InputValidationError([{ field: 'token', code: 'INVALID_TOKEN', message: 'token is not a valid participant-claim token.' }]);
    }
    return { claimId: parseParticipantClaimId(input.claimId), token };
}
function parseCreateEvidenceSession(value) {
    const input = object(value, 'body');
    rejectUnknown(input, [
        'schemaVersion', 'participantClaimId', 'type', 'allowedArtifactTypes', 'expiresInSeconds', 'maximumRedemptions',
        'requestedEvidenceCount', 'captureProfileId', 'captureGroupId',
    ]);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    if (!Array.isArray(input.allowedArtifactTypes) || input.allowedArtifactTypes.length < 1 || input.allowedArtifactTypes.length > evidence_1.evidenceArtifactTypes.length) {
        throw new core_1.InputValidationError([{ field: 'allowedArtifactTypes', code: 'INVALID_ARRAY', message: 'allowedArtifactTypes must contain one or more supported evidence artifact types.' }]);
    }
    const allowedArtifactTypes = input.allowedArtifactTypes.map((entry, index) => (enumValue(entry, `allowedArtifactTypes[${index}]`, evidence_1.evidenceArtifactTypes)));
    if (new Set(allowedArtifactTypes).size !== allowedArtifactTypes.length) {
        throw new core_1.InputValidationError([{ field: 'allowedArtifactTypes', code: 'DUPLICATE_VALUE', message: 'allowedArtifactTypes cannot contain duplicates.' }]);
    }
    return {
        participantClaimId: parseParticipantClaimId(input.participantClaimId),
        type: enumValue(input.type, 'type', evidence_1.evidenceSessionTypes),
        allowedArtifactTypes,
        expiresInSeconds: optionalInteger(input.expiresInSeconds, 'expiresInSeconds', 300, 7 * 86400, 86400),
        maximumRedemptions: optionalInteger(input.maximumRedemptions, 'maximumRedemptions', 1, 3, 1),
        requestedEvidenceCount: optionalInteger(input.requestedEvidenceCount, 'requestedEvidenceCount', 1, 24, 1),
        captureProfileId: optionalNullableString(input.captureProfileId, 'captureProfileId', 1, 120, /^[A-Za-z0-9._-]+$/),
        captureGroupId: optionalNullableString(input.captureGroupId, 'captureGroupId', 1, 160, /^[A-Za-z0-9_-]+$/),
    };
}
function parseRedeemEvidenceSession(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion', 'operationKey', 'token', 'runtimeArtifactHash']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    const token = string(input.token, 'token', 40, 200);
    if (!/^pp_capture_v1_[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new core_1.InputValidationError([{ field: 'token', code: 'INVALID_TOKEN', message: 'token is not a valid evidence-session redemption token.' }]);
    }
    return {
        operationKey: string(input.operationKey, 'operationKey', 8, 200),
        token,
        runtimeArtifactHash: optionalNullableString(input.runtimeArtifactHash, 'runtimeArtifactHash', 64, 64, /^[a-f0-9]{64}$/i),
    };
}
function parseAccessibleTransactionId(value) {
    if (typeof value === 'string' && /^txn_[a-f0-9]{32}$/.test(value))
        return value;
    if (typeof value === 'string' && /^[A-Za-z0-9_-]{10,128}$/.test(value))
        return value;
    throw new core_1.InputValidationError([{ field: 'transactionId', code: 'INVALID_ID', message: 'transactionId is not a valid PackProof transaction identifier.' }]);
}
function parseEvidenceArtifactId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'artifactId', code: 'INVALID_ID', message: 'artifactId is not a valid evidence artifact identifier.' }]);
    }
    return value;
}
function parseEvidenceReportId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'reportId', code: 'INVALID_ID', message: 'reportId is not a valid evidence report identifier.' }]);
    }
    return value;
}
function parseReturnPassportId(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'returnPassportId', code: 'INVALID_ID', message: 'returnPassportId is not a valid return-passport identifier.' }]);
    }
    return value;
}
function parseConnectSessionId(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
        throw new core_1.InputValidationError([{ field: 'sessionId', code: 'INVALID_ID', message: 'sessionId is not a valid PackProof Connect session identifier.' }]);
    }
    return value;
}
function parseListConnectSessions(query) {
    rejectUnknown(query, ['externalOrderId'], 'query');
    const externalOrderId = oneQueryValue(query.externalOrderId, 'externalOrderId');
    if (!externalOrderId) {
        throw new core_1.InputValidationError([{ field: 'externalOrderId', code: 'REQUIRED', message: 'externalOrderId is required to list Connect sessions.' }]);
    }
    return { externalOrderId: string(externalOrderId, 'externalOrderId', 1, 200) };
}
function parseCancelConnectSession(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    return { schemaVersion: 1 };
}
function parseHttpsCallbackUrl(value, field) {
    const raw = string(value, field, 12, 2_000);
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_URL', message: `${field} must be a valid URL.` }]);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw new core_1.InputValidationError([{ field, code: 'INVALID_URL', message: `${field} must use HTTPS without embedded credentials.` }]);
    }
    return raw;
}
function parseCreateConnectSession(value) {
    const input = object(value, 'body');
    rejectUnknown(input, [
        'schemaVersion', 'platform', 'externalOrderId', 'externalSellerId', 'itemTitle', 'itemDescription',
        'amount', 'trackingNumber', 'carrier', 'declaredWeightGrams', 'callbackUrl',
    ]);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    return {
        platform: string(input.platform, 'platform', 2, 80),
        externalOrderId: string(input.externalOrderId, 'externalOrderId', 1, 200),
        externalSellerId: string(input.externalSellerId, 'externalSellerId', 1, 200),
        itemTitle: string(input.itemTitle, 'itemTitle', 1, 300),
        itemDescription: string(input.itemDescription, 'itemDescription', 0, 3_000, false) ?? '',
        amount: (() => {
            if (input.amount === undefined) {
                throw new core_1.InputValidationError([{ field: 'amount', code: 'REQUIRED', message: 'amount is required.' }]);
            }
            const amount = parseAmount(input.amount);
            if (!amount)
                throw new core_1.InputValidationError([{ field: 'amount', code: 'REQUIRED', message: 'amount is required.' }]);
            return amount;
        })(),
        trackingNumber: string(input.trackingNumber, 'trackingNumber', 3, 160, false),
        carrier: string(input.carrier, 'carrier', 1, 80, false),
        declaredWeightGrams: input.declaredWeightGrams === undefined ? undefined : integer(input.declaredWeightGrams, 'declaredWeightGrams', 0, 2_000_000),
        callbackUrl: parseHttpsCallbackUrl(input.callbackUrl, 'callbackUrl'),
    };
}
function parseAssociateShipment(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion', 'carrier', 'trackingNumber']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    return {
        carrier: string(input.carrier, 'carrier', 1, 80),
        trackingNumber: string(input.trackingNumber, 'trackingNumber', 3, 160),
    };
}
function parseCreateEvidenceReport(value) {
    const input = object(value, 'body');
    rejectUnknown(input, ['schemaVersion']);
    if (input.schemaVersion !== 1) {
        throw new core_1.InputValidationError([{ field: 'schemaVersion', code: 'UNSUPPORTED_SCHEMA_VERSION', message: 'schemaVersion must equal 1.' }]);
    }
    return { schemaVersion: 1 };
}
function asApiError(error) {
    return error instanceof core_1.InputValidationError ? [...error.details] : [];
}
//# sourceMappingURL=validation.js.map