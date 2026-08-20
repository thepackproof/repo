"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPackProofFromIntake = exports.listPendingTransactionIntake = exports.ingestTransactionIntake = exports.previewTransactionIntake = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const transaction_intake_service_1 = require("./application/v1/transaction-intake-service");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const callable_errors_1 = require("./infrastructure/firebase/v1/callable-errors");
const transaction_intake_repository_1 = require("./infrastructure/firebase/v1/transaction-intake-repository");
const callOptions = { enforceAppCheck: true };
const intakeService = new transaction_intake_service_1.TransactionIntakeApplicationService(new transaction_intake_repository_1.FirestoreTransactionIntakeRepository(config_1.db));
const SHA256 = /^[a-f0-9]{64}$/;
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new https_1.HttpsError('invalid-argument', 'Request data must be an object.');
    return value;
}
function optionalText(value, field, max) {
    if (value === undefined || value === null)
        return null;
    if (typeof value !== 'string')
        throw new https_1.HttpsError('invalid-argument', `${field} must be a string.`);
    if (value.length > max)
        throw new https_1.HttpsError('invalid-argument', `${field} is too long.`);
    return value;
}
function requiredText(value, field, min, max) {
    const result = optionalText(value, field, max);
    if (!result || result.trim().length < min)
        throw new https_1.HttpsError('invalid-argument', `${field} is required.`);
    return result.trim();
}
function confirmedFields(value) {
    if (value === undefined || value === null)
        return null;
    const input = asRecord(value);
    const priceMinor = input.priceMinor;
    const quantity = input.quantity;
    if (priceMinor !== undefined && priceMinor !== null && (typeof priceMinor !== 'number' || !Number.isInteger(priceMinor) || priceMinor < 0 || priceMinor > 10_000_000_000)) {
        throw new https_1.HttpsError('invalid-argument', 'priceMinor must be a non-negative integer.');
    }
    if (quantity !== undefined && quantity !== null && (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100_000)) {
        throw new https_1.HttpsError('invalid-argument', 'quantity must be a positive integer.');
    }
    return {
        title: optionalText(input.title, 'confirmed.title', 300)?.trim() || undefined,
        description: optionalText(input.description, 'confirmed.description', 10_000) ?? undefined,
        variant: optionalText(input.variant, 'confirmed.variant', 300)?.trim() || undefined,
        sku: optionalText(input.sku, 'confirmed.sku', 160)?.trim() || undefined,
        priceMinor: typeof priceMinor === 'number' ? priceMinor : undefined,
        currency: optionalText(input.currency, 'confirmed.currency', 3)?.trim().toUpperCase() || undefined,
        orderNumber: optionalText(input.orderNumber, 'confirmed.orderNumber', 200)?.trim() || undefined,
        quantity: typeof quantity === 'number' ? quantity : undefined,
    };
}
exports.previewTransactionIntake = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    await (0, helpers_1.assertAccountActive)(uid);
    const input = asRecord(request.data);
    const intakeSourceType = requiredText(input.intakeSourceType, 'intakeSourceType', 3, 40);
    if (!(0, transaction_intake_service_1.isConsumerIntakeSourceType)(intakeSourceType)) {
        throw new https_1.HttpsError('invalid-argument', 'Unsupported intake source.');
    }
    try {
        const parsed = intakeService.preview(optionalText(input.artifactText, 'artifactText', 100_000), intakeSourceType);
        return {
            parserVersion: parsed.parserVersion,
            platformIdentifier: parsed.platformIdentifier,
            title: parsed.item.title || null,
            variant: parsed.item.selectedOptions[0]?.value ?? null,
            quantity: parsed.item.quantity,
            amount: parsed.item.amount,
            orderNumber: parsed.externalOrderId,
            sku: parsed.item.sku,
            missingFields: parsed.missingFields,
            heuristicFields: parsed.heuristicFields,
            extractionQuality: parsed.extractionQuality,
        };
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.ingestTransactionIntake = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    await (0, helpers_1.assertAccountActive)(uid);
    const input = asRecord(request.data);
    const intakeSourceType = requiredText(input.intakeSourceType, 'intakeSourceType', 3, 40);
    if (!(0, transaction_intake_service_1.isConsumerIntakeSourceType)(intakeSourceType)) {
        throw new https_1.HttpsError('invalid-argument', 'Unsupported intake source.');
    }
    const originalArtifactSha256 = requiredText(input.originalArtifactSha256, 'originalArtifactSha256', 64, 64).toLowerCase();
    if (!SHA256.test(originalArtifactSha256))
        throw new https_1.HttpsError('invalid-argument', 'originalArtifactSha256 must be a SHA-256 hex digest.');
    try {
        return await intakeService.ingestArtifact({
            actorId: uid,
            operationKey: requiredText(input.operationKey, 'operationKey', 8, 200),
            requestId: request.rawRequest.get('x-request-id') ?? (0, node_crypto_1.randomUUID)(),
            intakeSourceType,
            originalArtifactSha256,
            artifactText: optionalText(input.artifactText, 'artifactText', 100_000),
            confirmed: confirmedFields(input.confirmed),
        });
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.listPendingTransactionIntake = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    await (0, helpers_1.assertAccountActive)(uid);
    try {
        return { items: await intakeService.listPending(uid) };
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.startPackProofFromIntake = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const profile = await (0, helpers_1.assertAccountActive)(uid);
    const input = asRecord(request.data);
    try {
        return await intakeService.start({
            actorId: uid,
            plan: String(profile.plan ?? 'FREE'),
            commerceContextId: requiredText(input.commerceContextId, 'commerceContextId', 10, 160),
            requestId: request.rawRequest.get('x-request-id') ?? (0, node_crypto_1.randomUUID)(),
            confirmed: confirmedFields(input.confirmed),
        });
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
//# sourceMappingURL=transaction-intake-callables.js.map