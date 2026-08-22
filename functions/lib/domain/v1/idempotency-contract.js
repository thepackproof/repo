"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HC1_IDEMPOTENT_OPERATIONS = void 0;
exports.resolveIdempotentMutation = resolveIdempotentMutation;
exports.lostResponseAfterSuccess = lostResponseAfterSuccess;
function resolveIdempotentMutation(input) {
    if (!input.existing) {
        return { type: input.simultaneous ? 'EXECUTE' : 'EXECUTE' };
    }
    if (input.existing.fingerprint !== input.incomingFingerprint) {
        return { type: 'CONFLICT' };
    }
    if (input.existing.state === 'PROCESSING')
        return { type: 'IN_PROGRESS' };
    return { type: 'REPLAY' };
}
function lostResponseAfterSuccess() {
    return { type: 'REPLAY' };
}
exports.HC1_IDEMPOTENT_OPERATIONS = [
    'transaction.create',
    'receipt.intake',
    'buyer.invite',
    'participant.claim',
    'terms.confirm',
    'capture-session.create',
    'upload.reserve',
    'shipment.associate',
    'delivery.associate',
    'return.create',
    'return.shipment',
    'proof.snapshot',
    'proof.pdf',
    'webhook.deliver',
    'enterprise.session.create',
];
//# sourceMappingURL=idempotency-contract.js.map