"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.participantClaimDtoSchema = exports.claimTransitions = exports.claimStatuses = exports.transactionDtoSchema = exports.transactionTransitions = exports.transactionStatuses = exports.fulfillmentStates = exports.termsStates = exports.transactionOrigins = exports.participantClaimStates = exports.participantRoles = void 0;
const common_1 = require("./common");
const runtime_1 = require("./runtime");
exports.participantRoles = ['SELLER', 'BUYER', 'RECEIVER', 'RETURN_SENDER', 'RETURN_RECIPIENT', 'WITNESS'];
exports.participantClaimStates = ['UNCLAIMED', 'INVITED', 'CLAIMED', 'EXPIRED', 'REVOKED'];
exports.transactionOrigins = ['CONSUMER', 'MERCHANT_API', 'PACKPROOF_CONNECT', 'COMMERCE_ADAPTER'];
exports.termsStates = ['DRAFT', 'AWAITING_PARTICIPANTS', 'IN_REVIEW', 'LOCKED', 'CANCELLED'];
exports.fulfillmentStates = ['NOT_STARTED', 'PACKING', 'PACKED', 'IN_TRANSIT', 'RECEIVER_REVIEW', 'COMPLETED', 'DISPUTED', 'NOT_APPLICABLE'];
exports.transactionStatuses = ['DRAFT', 'ACTIVE', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'ARCHIVED'];
exports.transactionTransitions = {
    DRAFT: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['COMPLETED', 'DISPUTED', 'CANCELLED'],
    COMPLETED: ['DISPUTED', 'ARCHIVED'],
    DISPUTED: ['COMPLETED', 'CANCELLED', 'ARCHIVED'],
    CANCELLED: ['ARCHIVED'],
    ARCHIVED: [],
};
function parseParticipant(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['role', 'externalReference', 'displayLabel', 'claimState']);
    return {
        role: (0, runtime_1.enumValue)(input.role, `${path}.role`, exports.participantRoles),
        externalReference: (0, runtime_1.stringValue)(input.externalReference, `${path}.externalReference`, { min: 1, max: 300 }),
        displayLabel: (0, runtime_1.optionalString)(input.displayLabel, `${path}.displayLabel`, { min: 1, max: 160 }),
        claimState: (0, runtime_1.enumValue)(input.claimState, `${path}.claimState`, exports.participantClaimStates),
    };
}
function parseItem(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['title', 'description', 'category', 'amount', 'identifiers', 'conditionNotes']);
    return {
        title: (0, runtime_1.stringValue)(input.title, `${path}.title`, { min: 1, max: 300 }),
        description: (0, runtime_1.stringValue)(input.description, `${path}.description`, { max: 10_000, trim: false }),
        category: (0, runtime_1.optionalString)(input.category, `${path}.category`, { min: 1, max: 160 }),
        amount: input.amount === undefined || input.amount === null ? null : (0, common_1.parseMoney)(input.amount, `${path}.amount`),
        identifiers: (0, runtime_1.arrayValue)(input.identifiers, `${path}.identifiers`, {
            max: 30,
            uniqueBy: (entry) => `${entry.label.toLowerCase()}:${entry.value}`,
            parse: (entry, entryPath) => {
                const item = (0, runtime_1.strictObject)(entry, entryPath, ['label', 'value']);
                return {
                    label: (0, runtime_1.stringValue)(item.label, `${entryPath}.label`, { min: 1, max: 160 }),
                    value: (0, runtime_1.stringValue)(item.value, `${entryPath}.value`, { min: 1, max: 300 }),
                };
            },
        }),
        conditionNotes: (0, runtime_1.stringValue)(input.conditionNotes, `${path}.conditionNotes`, { max: 10_000, trim: false }),
    };
}
function parseTerms(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['saleType', 'shippingResponsibility', 'returns', 'returnWindowDays', 'customTerms']);
    return {
        saleType: (0, runtime_1.enumValue)(input.saleType, `${path}.saleType`, ['SHIPPED', 'LOCAL_HANDOFF']),
        shippingResponsibility: (0, runtime_1.enumValue)(input.shippingResponsibility, `${path}.shippingResponsibility`, ['SELLER', 'BUYER', 'NOT_APPLICABLE']),
        returns: (0, runtime_1.enumValue)(input.returns, `${path}.returns`, ['NO_RETURNS', 'AS_AGREED', 'PLATFORM_POLICY']),
        returnWindowDays: (0, runtime_1.integerValue)(input.returnWindowDays, `${path}.returnWindowDays`, 0, 365),
        customTerms: (0, runtime_1.stringValue)(input.customTerms, `${path}.customTerms`, { max: 10_000, trim: false }),
    };
}
exports.transactionDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'transaction', [
        'id', 'object', 'schemaVersion', 'origin', 'merchantReference', 'commerceContextId', 'passportDraftId', 'item', 'terms',
        'participants', 'termsState', 'fulfillmentState', 'status', 'termsLockedAt', 'completedAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'transaction.object', 'transaction');
    (0, runtime_1.literalValue)(input.schemaVersion, 'transaction.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('transaction', input.id, 'transaction.id', { allowLegacy: true }),
        object: 'transaction',
        schemaVersion: 1,
        origin: (0, runtime_1.enumValue)(input.origin, 'transaction.origin', exports.transactionOrigins),
        merchantReference: (0, runtime_1.optionalString)(input.merchantReference, 'transaction.merchantReference', { min: 1, max: 200 }),
        commerceContextId: input.commerceContextId === undefined || input.commerceContextId === null ? null : (0, common_1.parseResourceId)('commerce_context', input.commerceContextId, 'transaction.commerceContextId'),
        passportDraftId: input.passportDraftId === undefined || input.passportDraftId === null ? null : (0, common_1.parseResourceId)('passport_draft', input.passportDraftId, 'transaction.passportDraftId'),
        item: parseItem(input.item, 'transaction.item'),
        terms: parseTerms(input.terms, 'transaction.terms'),
        participants: (0, runtime_1.arrayValue)(input.participants, 'transaction.participants', { max: 10, parse: parseParticipant, uniqueBy: (participant) => `${participant.role}:${participant.externalReference}` }),
        termsState: (0, runtime_1.enumValue)(input.termsState, 'transaction.termsState', exports.termsStates),
        fulfillmentState: (0, runtime_1.enumValue)(input.fulfillmentState, 'transaction.fulfillmentState', exports.fulfillmentStates),
        status: (0, runtime_1.enumValue)(input.status, 'transaction.status', exports.transactionStatuses),
        termsLockedAt: (0, runtime_1.optionalIsoDateTime)(input.termsLockedAt, 'transaction.termsLockedAt'),
        completedAt: (0, runtime_1.optionalIsoDateTime)(input.completedAt, 'transaction.completedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'transaction.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'transaction.updatedAt'),
    };
});
exports.claimStatuses = ['ISSUED', 'CLAIMED', 'EXPIRED', 'REVOKED'];
exports.claimTransitions = {
    ISSUED: ['CLAIMED', 'EXPIRED', 'REVOKED'],
    CLAIMED: [],
    EXPIRED: [],
    REVOKED: [],
};
exports.participantClaimDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'participantClaim', ['id', 'object', 'schemaVersion', 'transactionId', 'role', 'status', 'expiresAt', 'claimedAt', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'participantClaim.object', 'participant_claim');
    (0, runtime_1.literalValue)(input.schemaVersion, 'participantClaim.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('participant_claim', input.id, 'participantClaim.id'),
        object: 'participant_claim',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'participantClaim.transactionId', { allowLegacy: true }),
        role: (0, runtime_1.enumValue)(input.role, 'participantClaim.role', exports.participantRoles),
        status: (0, runtime_1.enumValue)(input.status, 'participantClaim.status', exports.claimStatuses),
        expiresAt: (0, runtime_1.isoDateTime)(input.expiresAt, 'participantClaim.expiresAt'),
        claimedAt: (0, runtime_1.optionalIsoDateTime)(input.claimedAt, 'participantClaim.claimedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'participantClaim.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'participantClaim.updatedAt'),
    };
});
//# sourceMappingURL=transactions.js.map